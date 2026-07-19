// The catalog defines WHICH integration modules exist and what they connect to. Modules are grouped
// by `kind` so the rest of the system can ask generic questions ("is any registrar active?", "which
// hosting module handles this product?") without hard-coding provider names. Kinds are intentionally
// open-ended: today we ship a domain `registrar` and a `hosting` panel, but server-provider modules
// (e.g. Hetzner) will slot in by adding a new kind + catalog entry — no core changes required.
//
// Module ENABLED-state and config VALUES live in SystemSetting rows (`module.<name>.<field>`); the
// catalog only describes the shape. The prod/dev .env is consulted as a FALLBACK via `envFallback`.

// `platform` = a provisioning module that creates a whole Teculiar TENANT (its own database) rather
// than a hosting account or a domain — used by Teculiar.com's own catalog to sell Teculiar itself
// (the Tecreator module). It plugs into the identical order→invoice→provision pipeline as `hosting`.
// `payment` = a checkout/renewal payment gateway integration. Unlike the other kinds, its
// CREDENTIALS live in PaymentProcessorConfig (Admin → Payment Gateways), not in SystemSetting —
// the catalog entry contributes identity + the registry on/off switch (module.<name>.active).
export const MODULE_KINDS = ["registrar", "hosting", "platform", "payment"] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

export type ModuleFieldType = "text" | "secret" | "boolean" | "select";

export interface ModuleField {
  key: string;
  label: string;
  type: ModuleFieldType;
  /** env var names checked (in order) when the DB value is empty. */
  envFallback?: string[];
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
}

export interface ModuleDefinition {
  name: string;
  kind: ModuleKind;
  label: string;
  description: string;
  fields: ModuleField[];
}

// Resell.biz uses the LogicBoxes HTTP API. Test and live share the same request shape but hit
// different hosts; the admin picks the mode and the module derives the base URL from it.
export const RESELLBIZ_TEST_BASE_URL = "https://test.httpapi.com";
export const RESELLBIZ_LIVE_BASE_URL = "https://httpapi.com";

// Last-resort default name servers when neither the customer (checkout) nor the module config supply
// any. Domain registrations must always be sent with at least two name servers.
export const DEFAULT_NAME_SERVERS = ["ns5.dezhost.com", "ns6.dezhost.com"];

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    name: "resellbiz",
    kind: "registrar",
    label: "Resell.biz Domain Registrar",
    description: "Automated domain registration, transfer, and renewal via the Resell.biz API.",
    fields: [
      {
        // Note: the env RESELLBIZ_API_BASE_URL fallback is resolved in ModuleRegistryService.resellbiz()
        // (not as a field fallback) so the admin select shows a clean test/live value, never a raw URL.
        key: "mode",
        label: "API mode",
        type: "select",
        options: [
          { value: "test", label: "Test (test.httpapi.com)" },
          { value: "live", label: "Live (httpapi.com)" }
        ],
        help: "Test uses the Resell.biz sandbox; Live uses the production API."
      },
      {
        key: "resellerId",
        label: "Reseller ID",
        type: "text",
        envFallback: ["RESELLBIZ_RESELLER_ID", "RESELLBIZ_AUTH_USERID"],
        placeholder: "auth-userid"
      },
      {
        key: "apiKey",
        label: "API key",
        type: "secret",
        envFallback: ["RESELLBIZ_API_KEY", "RESELLBIZ_PASSWORD"]
      },
      {
        key: "defaultNs",
        label: "Default name servers",
        type: "text",
        envFallback: ["RESELLBIZ_DEFAULT_NS"],
        placeholder: "ns5.dezhost.com, ns6.dezhost.com",
        help: "Used when the customer leaves name servers blank at checkout. Falls back to ns5.dezhost.com, ns6.dezhost.com."
      }
    ]
  },
  {
    name: "virtualmin",
    kind: "hosting",
    label: "Virtualmin Hosting Panel",
    description: "Automated hosting account provisioning and management via the Virtualmin API.",
    fields: [
      {
        key: "endpoint",
        label: "Virtualmin Server URL",
        type: "text",
        envFallback: ["VIRTUALMIN_ADMIN_ENDPOINT"],
        placeholder: "https://hosting.example.com:10000"
      },
      {
        key: "username",
        label: "Admin Username",
        type: "text",
        envFallback: ["VIRTUALMIN_ADMIN_USERNAME"],
        placeholder: "root"
      },
      {
        key: "password",
        label: "Admin Password",
        type: "secret",
        envFallback: ["VIRTUALMIN_ADMIN_PASSWORD"]
      },
      {
        key: "allowSelfSigned",
        label: "Allow Self-Signed SSL Certificate",
        type: "boolean",
        envFallback: ["VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED"]
      },
      {
        key: "jobDelayMinutes",
        label: "Minutes between server jobs",
        type: "text",
        placeholder: "0",
        help: "Minimum delay enforced between Virtualmin create / suspend / delete jobs so the panel never receives simultaneous changes. 0 disables the delay."
      }
    ]
  },
  {
    // Tecreator provisions a brand-new Teculiar TENANT on purchase (create DB + user → migrate → seed
    // Blue content + admin → register in the control-plane → email credentials). It reuses the 4.1
    // `createTenant` primitive and the DB admin connection from TENANT_ADMIN_DATABASE_URL / the
    // control-plane, so it needs no per-tenant secrets of its own — only a couple of defaults.
    name: "tecreator",
    kind: "platform",
    label: "Tecreator Tenant Provisioning",
    description: "Provisions a new Teculiar tenant (its own database) when a Teculiar plan is purchased.",
    fields: [
      {
        key: "subdomainPrefix",
        label: "Auto-subdomain prefix",
        type: "text",
        placeholder: "user",
        help: "Prefix for auto-generated tenant subdomains when the buyer does not choose one (e.g. user0042.teculiar.net)."
      },
      {
        key: "defaultPlan",
        label: "Default plan label",
        type: "text",
        placeholder: "teculiar",
        help: "Plan label recorded on the tenant in the control-plane when the product does not specify one."
      }
    ]
  },
  // Payment gateways (kind "payment"). No `fields`: credentials live in PaymentProcessorConfig
  // (Admin → Payment Gateways, one row per checkout method); the module toggle here is the
  // registry-level kill switch PaymentRegistryService consults before routing a charge.
  {
    name: "paypal",
    kind: "payment",
    label: "PayPal Payments",
    description: "PayPal checkout + vault charges. Credentials (client ID/secret, sandbox vs live mode) are configured under Admin → Payment Gateways.",
    fields: []
  },
  {
    name: "mollie",
    kind: "payment",
    label: "Mollie Payments",
    description: "Credit card, SEPA Direct Debit and PayPal-via-Mollie. The API key is configured under Admin → Payment Gateways.",
    fields: []
  }
];

export function moduleDefinition(name: string): ModuleDefinition | undefined {
  return MODULE_CATALOG.find((module) => module.name === name);
}

// Maps stored registrar identifiers (DomainRecord.registrarModule / registrarProvider, which on
// legacy rows is "resell.biz") onto a catalog module name. Returns undefined for manual/none.
export function canonicalModuleName(value: string | null | undefined): string | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "none" || raw === "manual") {
    return undefined;
  }
  if (raw === "resell.biz" || raw === "resellbiz" || raw === "resell-biz") {
    return "resellbiz";
  }
  return moduleDefinition(raw) ? raw : raw;
}

// ── Provisioning-module precedence (Phase 6.2) — the ONE shared resolution chain ─────────────────
// PRODUCT-FIRST: the product's own provisioningModule wins; the category's module is only a
// default (prefilled into the admin product form, backfilled once by migration 20260719130000);
// the product-type default is the last resort. For services, the snapshot captured at provision
// time (Service.moduleName) ranks between the product and the category.
//
// "none"/"manual" is an EXPLICIT provision-manually choice and stops the chain (undefined);
// NULL/empty means "not set" and falls through to the next source.

export type ModuleProduct = {
  category?: { provisioningModule?: string | null } | null;
  provisioningModule?: string | null;
  type?: string;
};

export function moduleNameForProductType(type?: string): string {
  return ["VPS", "DEDICATED_SERVER"].includes(type ?? "") ? "hetzner" : "virtualmin";
}

export function effectiveProductModule(product: ModuleProduct): string | undefined {
  const own = moduleChoice(product.provisioningModule);
  if (own.set) {
    return own.module;
  }
  const category = moduleChoice(product.category?.provisioningModule);
  if (category.set) {
    return category.module;
  }
  return moduleNameForProductType(product.type);
}

export function effectiveServiceModule(service: { moduleName?: string | null; product?: ModuleProduct | null }): string | undefined {
  const own = moduleChoice(service.product?.provisioningModule);
  if (own.set) {
    return own.module;
  }
  const snapshot = moduleChoice(service.moduleName);
  if (snapshot.set) {
    return snapshot.module;
  }
  const category = moduleChoice(service.product?.category?.provisioningModule);
  if (category.set) {
    return category.module;
  }
  return moduleNameForProductType(service.product?.type);
}

function moduleChoice(value: string | null | undefined): { set: boolean; module?: string } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { set: false };
  }
  return { set: true, module: canonicalModuleName(raw) };
}
