// Partial/format-preserving masking for the read-only "agent" role (restricted credential used
// for automated dashboard testing — see AgentWriteBlockGuard). Keeps enough shape for UI/format
// checks (e.g. "j***@example.com") without ever returning a real customer's actual PII.

const FULL_TRUST_ROLES = ["admin", "staff", "super_admin", "support_agent", "sales_agent"];

export function shouldMask(roles: string[] | undefined): boolean {
  const list = roles ?? [];
  return list.includes("agent") && !list.some((role) => FULL_TRUST_ROLES.includes(role));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function maskEmail<T extends string | null | undefined>(email: T): T {
  if (!email) return email;
  const at = email.indexOf("@");
  if (at <= 0) return "***" as T;
  return `${email[0]}***${email.slice(at)}` as T;
}

function maskName<T extends string | null | undefined>(name: T): T {
  if (!name) return name;
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word[0]}***`)
    .join(" ") as T;
}

function maskPhone<T extends string | null | undefined>(phone: T): T {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 2) return "***" as T;
  return `***${digits.slice(-2)}` as T;
}

function maskVatId<T extends string | null | undefined>(vatId: T): T {
  if (!vatId || vatId.length <= 4) return vatId ? ("***" as T) : vatId;
  return `${vatId.slice(0, 2)}***${vatId.slice(-2)}` as T;
}

const ADDRESS_FIELDS_TO_MASK = ["line1", "line2", "city", "postalCode", "state"];

function maskAddress(address: unknown): unknown {
  if (!isRecord(address)) return address;
  const masked: Record<string, unknown> = { ...address };
  for (const field of ADDRESS_FIELDS_TO_MASK) {
    if (typeof masked[field] === "string" && masked[field]) {
      masked[field] = "***";
    }
  }
  return masked;
}

// Nested `user`/`assignee` refs on orders, invoices, and tickets (each module keeps its own
// `publicUserSelect`, but they all carry email/name/vatId).
export function maskUserRef<T extends { email: string; name: string; vatId?: string | null }>(user: T): T {
  return {
    ...user,
    email: maskEmail(user.email),
    name: maskName(user.name),
    vatId: maskVatId(user.vatId)
  };
}

// Billing `customerSnapshot` JSON blob (see customerSnapshotFromBillingProfile in billing.service.ts).
export function maskCustomerSnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot;
  return {
    ...snapshot,
    email: typeof snapshot.email === "string" ? maskEmail(snapshot.email) : snapshot.email,
    name: typeof snapshot.name === "string" ? maskName(snapshot.name) : snapshot.name,
    phone: typeof snapshot.phone === "string" ? maskPhone(snapshot.phone) : snapshot.phone,
    vatId: typeof snapshot.vatId === "string" ? maskVatId(snapshot.vatId) : snapshot.vatId,
    address: maskAddress(snapshot.address)
  };
}

// ── Deep masking for freeform JSON blobs ─────────────────────────────────────────
// Snapshots, item/service configurations, audit-log metadata, and email payloads are arbitrary
// JSON that can embed customer data under many key spellings. deepMaskPii walks the whole value
// and masks by key name — deliberately over-masking (a masked product name in a log is harmless;
// a leaked registrant email is not). Structured ORM relations (user/assignee/product) are masked
// with the targeted helpers above instead, so their non-PII fields stay readable.
const SECRET_KEY_RE = /password|secret|api_?key|token|epp_?code|auth_?code/i;
const EMAIL_KEY_RE = /email|^to$/i;
const NAME_KEY_RE = /^(name|full_?name|first_?name|last_?name|customer_?name|contact_?name|registrant_?name)$/i;
const PHONE_KEY_RE = /phone|mobile|telephone|fax/i;
const VAT_KEY_RE = /vat/i;
const ADDRESS_KEY_RE = /^(address|street|line1|line2|city|state|zip|zip_?code|postal_?code|post_?code)$/i;

export function deepMaskPii(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepMaskPii);
  if (!isRecord(value)) return value;
  const masked: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    masked[key] = maskByKey(key, entry);
  }
  return masked;
}

function maskByKey(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (SECRET_KEY_RE.test(key)) return "***";
  if (typeof value === "string") {
    if (EMAIL_KEY_RE.test(key)) return maskEmail(value);
    if (NAME_KEY_RE.test(key)) return maskName(value);
    if (PHONE_KEY_RE.test(key)) return maskPhone(value);
    if (VAT_KEY_RE.test(key)) return maskVatId(value);
    if (ADDRESS_KEY_RE.test(key)) return "***";
    return value;
  }
  if (Array.isArray(value) && EMAIL_KEY_RE.test(key)) {
    return value.map((item) => (typeof item === "string" ? maskEmail(item) : deepMaskPii(item)));
  }
  return deepMaskPii(value);
}

// ── Composed maskers for the shapes the admin endpoints return ───────────────────
// Loosely typed on purpose: they must tolerate every Prisma include-variant of these records
// (list rows, detail rows, rows nested inside a client), masking what's present.

function maskDomainRecord<T extends Record<string, unknown>>(record: T): T {
  return {
    ...record,
    ...(record.eppCode ? { eppCode: "***" } : {}),
    ...(record.authCodeHash ? { authCodeHash: "***" } : {})
  };
}

export function maskService<T extends Record<string, any>>(service: T): T {
  return {
    ...service,
    ...("configuration" in service ? { configuration: deepMaskPii(service.configuration) } : {}),
    ...(service.user ? { user: maskUserRef(service.user) } : {}),
    ...(Array.isArray(service.domainRecords) ? { domainRecords: service.domainRecords.map(maskDomainRecord) } : {})
  };
}

export function maskOrder<T extends Record<string, any>>(order: T): T {
  return {
    ...order,
    ...(order.user ? { user: maskUserRef(order.user) } : {}),
    ...("customerSnapshot" in order ? { customerSnapshot: deepMaskPii(order.customerSnapshot) } : {}),
    ...("orderSnapshot" in order ? { orderSnapshot: deepMaskPii(order.orderSnapshot) } : {}),
    ...(order.invoice && typeof order.invoice === "object" && !Array.isArray(order.invoice)
      ? { invoice: maskInvoice(order.invoice) }
      : {}),
    ...(Array.isArray(order.items)
      ? { items: order.items.map((item: Record<string, any>) => ("configuration" in item ? { ...item, configuration: deepMaskPii(item.configuration) } : item)) }
      : {})
  };
}

export function maskInvoice<T extends Record<string, any>>(invoice: T): T {
  return {
    ...invoice,
    ...(invoice.user ? { user: maskUserRef(invoice.user) } : {}),
    ...("customerSnapshot" in invoice ? { customerSnapshot: deepMaskPii(invoice.customerSnapshot) } : {}),
    ...("orderSnapshot" in invoice ? { orderSnapshot: deepMaskPii(invoice.orderSnapshot) } : {}),
    // Avoid mutual recursion with maskOrder: mask only the nested order's own blob fields.
    ...(invoice.order && typeof invoice.order === "object" && !Array.isArray(invoice.order)
      ? {
          order: {
            ...invoice.order,
            ...("customerSnapshot" in invoice.order ? { customerSnapshot: deepMaskPii(invoice.order.customerSnapshot) } : {}),
            ...("orderSnapshot" in invoice.order ? { orderSnapshot: deepMaskPii(invoice.order.orderSnapshot) } : {})
          }
        }
      : {})
  };
}

// Full customer record shape from `clientSelect` (users.repository.ts): top-level identity
// fields, contacts[].{phone,address}, and the nested invoices/orders/services rows (each of
// which carries its own snapshots, configurations, and domain secrets).
export function maskClient<
  T extends {
    email: string;
    name: string;
    vatId?: string | null;
    contacts?: Array<{ phone?: string | null; address?: unknown }>;
    invoices?: Array<Record<string, any>>;
    orders?: Array<Record<string, any>>;
    services?: Array<Record<string, any>>;
  }
>(client: T): T {
  return {
    ...maskUserRef(client),
    contacts: client.contacts?.map((contact) => ({
      ...contact,
      phone: maskPhone(contact.phone),
      address: maskAddress(contact.address)
    })),
    ...(client.invoices ? { invoices: client.invoices.map(maskInvoice) } : {}),
    ...(client.orders ? { orders: client.orders.map(maskOrder) } : {}),
    ...(client.services ? { services: client.services.map(maskService) } : {})
  };
}
