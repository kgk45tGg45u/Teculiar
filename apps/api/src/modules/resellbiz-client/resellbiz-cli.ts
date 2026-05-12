import { ResellBizClient, credentialsFromEnv, type ResellBizDomainTarget, type TransferDomainInput } from "./resellbiz-api";
import { findDotEnv, loadDotEnv } from "./resellbiz-env";

type Flags = Map<string, string[]>;

loadDotEnv();

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...args] = argv;

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "env-check") {
    writeJson({
      apiBaseUrl: process.env.RESELLBIZ_API_BASE_URL ?? "https://httpapi.com",
      apiKeyPresent: Boolean(process.env.RESELLBIZ_API_KEY),
      envFile: findDotEnv() ?? null,
      passwordFallbackPresent: Boolean(process.env.RESELLBIZ_PASSWORD),
      resellerIdPresent: Boolean(process.env.RESELLBIZ_RESELLER_ID ?? process.env.RESELLBIZ_AUTH_USERID)
    });
    return;
  }

  const client = new ResellBizClient(credentialsFromEnv());

  if (command === "status") {
    writeJson(await client.getDomainSummary(required(args[0], "domain")));
    return;
  }

  if (command === "auth-code" || command === "transfer-code") {
    const transferCode = await client.getTransferCode(targetFrom(required(args[0], "domain or order id")));
    writeJson({ transferCode: transferCode ?? null });
    return;
  }

  if (command === "change-ns") {
    const [target, ...nameServers] = args;
    writeJson(await client.changeNameServers(targetFrom(required(target, "domain or order id")), nameServers));
    return;
  }

  if (command === "validate-transfer") {
    writeJson({ transferable: await client.validateTransfer(required(args[0], "domain")) });
    return;
  }

  if (command === "transfer") {
    writeJson(await client.transferDomain(transferInputFrom(args)));
    return;
  }

  if (command === "register") {
    writeJson(await client.registerDomain(registerInputFrom(args)));
    return;
  }

  if (command === "register-customer") {
    const input = registerCustomerInputFrom(args);
    const customerId = await client.addCustomer(input.customer);
    const contactId = await client.addContact({ ...input.contact, customerId });
    const payload = await client.registerDomain({
      adminContactId: contactId,
      autoRenew: true,
      billingContactId: contactId,
      customerId,
      discountAmount: 0,
      domainName: input.domainName,
      extraAttributes: input.extraAttributes,
      invoiceOption: "NoInvoice",
      nameServers: input.nameServers,
      protectPrivacy: false,
      purchasePrivacy: false,
      registrantContactId: contactId,
      technicalContactId: contactId,
      years: input.years
    });
    writeJson({ contactId, customerId, domainName: input.domainName, payload });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function registerCustomerInputFrom(args: string[]) {
  const { flags, positional } = parseFlags(args);
  const domainName = required(positional[0], "domain");
  const email = required(oneFlag(flags, "email"), "email");
  const name = oneFlag(flags, "name") ?? "Dezhost Test Buyer";
  const country = oneFlag(flags, "country") ?? "DE";
  const phoneCountryCode = oneFlag(flags, "phone-cc") ?? "49";
  const phone = oneFlag(flags, "phone") ?? "30123456";

  const base = {
    addressLine1: oneFlag(flags, "address") ?? "Main Street 1",
    city: oneFlag(flags, "city") ?? "Berlin",
    company: oneFlag(flags, "company") ?? "N/A",
    country,
    email,
    name,
    phone,
    phoneCountryCode,
    state: oneFlag(flags, "state") ?? "Berlin",
    zipCode: oneFlag(flags, "zip") ?? "10115"
  };

  return {
    contact: { ...base, type: "Contact" as const },
    customer: { ...base, password: `Dz${Date.now().toString(36)}!9Aa` },
    domainName,
    extraAttributes: attrsFrom(flags.get("attr") ?? []),
    nameServers: flags.get("ns") ?? ["ns1.domain.com", "ns2.domain.com"],
    years: Number(oneFlag(flags, "years") ?? 1)
  };
}

function registerInputFrom(args: string[]) {
  const { flags, positional } = parseFlags(args);
  const domainName = required(positional[0], "domain");
  const contactId = numberFlag(flags, "contact-id");

  return {
    adminContactId: optionalNumberFlag(flags, "admin-contact-id") ?? contactId,
    autoRenew: booleanFlag(flags, "auto-renew"),
    billingContactId: optionalNumberFlag(flags, "billing-contact-id") ?? contactId,
    customerId: numberFlag(flags, "customer-id"),
    discountAmount: 0,
    domainName,
    extraAttributes: attrsFrom(flags.get("attr") ?? []),
    invoiceOption: invoiceOptionFrom(required(oneFlag(flags, "invoice-option"), "invoice option")),
    nameServers: flags.get("ns") ?? ["ns1.domain.com", "ns2.domain.com"],
    protectPrivacy: optionalBooleanFlag(flags, "protect-privacy") ?? false,
    purchasePrivacy: optionalBooleanFlag(flags, "purchase-privacy") ?? false,
    registrantContactId: optionalNumberFlag(flags, "reg-contact-id") ?? contactId,
    technicalContactId: optionalNumberFlag(flags, "tech-contact-id") ?? contactId,
    years: Number(oneFlag(flags, "years") ?? 1)
  };
}

function transferInputFrom(args: string[]): TransferDomainInput {
  const { flags, positional } = parseFlags(args);
  const domainName = required(positional[0], "domain");

  return {
    adminContactId: numberFlag(flags, "admin-contact-id"),
    authCode: oneFlag(flags, "auth-code"),
    autoRenew: booleanFlag(flags, "auto-renew"),
    billingContactId: numberFlag(flags, "billing-contact-id"),
    customerId: numberFlag(flags, "customer-id"),
    domainName,
    extraAttributes: attrsFrom(flags.get("attr") ?? []),
    invoiceOption: invoiceOptionFrom(required(oneFlag(flags, "invoice-option"), "invoice option")),
    nameServers: flags.get("ns"),
    protectPrivacy: optionalBooleanFlag(flags, "protect-privacy"),
    purchasePremiumDns: optionalBooleanFlag(flags, "purchase-premium-dns"),
    purchasePrivacy: optionalBooleanFlag(flags, "purchase-privacy"),
    registrantContactId: numberFlag(flags, "reg-contact-id"),
    technicalContactId: numberFlag(flags, "tech-contact-id")
  };
}

function parseFlags(args: string[]): { flags: Flags; positional: string[] } {
  const flags: Flags = new Map();
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value?.startsWith("--")) {
      if (value) {
        positional.push(value);
      }
      continue;
    }

    const raw = value.slice(2);
    const [key, inlineValue] = raw.split("=", 2);
    const next = inlineValue ?? args[index + 1];
    if (!key || !next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}.`);
    }

    index += inlineValue === undefined ? 1 : 0;
    flags.set(key, [...(flags.get(key) ?? []), next]);
  }

  return { flags, positional };
}

function targetFrom(value: string): ResellBizDomainTarget {
  return /^\d+$/.test(value) ? { orderId: Number(value) } : { domainName: value };
}

function oneFlag(flags: Flags, key: string): string | undefined {
  return flags.get(key)?.at(-1);
}

function numberFlag(flags: Flags, key: string): number {
  const value = Number(required(oneFlag(flags, key), key));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${key} must be a positive integer.`);
  }

  return value;
}

function optionalNumberFlag(flags: Flags, key: string): number | undefined {
  return flags.has(key) ? numberFlag(flags, key) : undefined;
}

function booleanFlag(flags: Flags, key: string): boolean {
  const value = required(oneFlag(flags, key), key).toLowerCase();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`--${key} must be true or false.`);
}

function optionalBooleanFlag(flags: Flags, key: string): boolean | undefined {
  return flags.has(key) ? booleanFlag(flags, key) : undefined;
}

function invoiceOptionFrom(value: string): TransferDomainInput["invoiceOption"] {
  if (["KeepInvoice", "NoInvoice", "OnlyAdd", "PayInvoice"].includes(value)) {
    return value as TransferDomainInput["invoiceOption"];
  }

  throw new Error("--invoice-option must be KeepInvoice, NoInvoice, OnlyAdd, or PayInvoice.");
}

function attrsFrom(values: string[]): Record<string, string> | undefined {
  const attrs: Record<string, string> = {};

  for (const value of values) {
    const [key, attrValue] = value.split("=", 2);
    if (!key || attrValue === undefined) {
      throw new Error("--attr must look like name=value.");
    }
    attrs[key] = attrValue;
  }

  return Object.keys(attrs).length > 0 ? attrs : undefined;
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function writeJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp(): void {
  console.log(`Resell.biz domain script

Commands:
  status <domain>
  env-check
  auth-code <domain|order-id>
  change-ns <domain|order-id> <ns1> <ns2> [ns3...]
  validate-transfer <domain>
  transfer <domain> --customer-id <id> --reg-contact-id <id> --admin-contact-id <id> --tech-contact-id <id> --billing-contact-id <id> --invoice-option <option> --auto-renew <true|false> [--auth-code <code>] [--ns <host>] [--attr name=value]
  register <domain> --customer-id <id> --contact-id <id> --invoice-option <option> --auto-renew <true|false> [--years <n>] [--ns <host>] [--attr name=value]
  register-customer <domain> --email <email> [--name <name>] [--ns <host>] [--attr name=value]
`);
}
