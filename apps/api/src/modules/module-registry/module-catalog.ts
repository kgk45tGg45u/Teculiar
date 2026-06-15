// The catalog defines WHICH integration modules exist and what they connect to. Modules are grouped
// by `kind` so the rest of the system can ask generic questions ("is any registrar active?", "which
// hosting module handles this product?") without hard-coding provider names. Kinds are intentionally
// open-ended: today we ship a domain `registrar` and a `hosting` panel, but server-provider modules
// (e.g. Hetzner) will slot in by adding a new kind + catalog entry — no core changes required.
//
// Module ENABLED-state and config VALUES live in SystemSetting rows (`module.<name>.<field>`); the
// catalog only describes the shape. The prod/dev .env is consulted as a FALLBACK via `envFallback`.

export const MODULE_KINDS = ["registrar", "hosting"] as const;
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
