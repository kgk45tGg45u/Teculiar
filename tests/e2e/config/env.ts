/**
 * Centralised environment configuration for the comprehensive E2E suite.
 *
 * Every value is overridable via environment variables so the same suite runs
 * against production (default) or a local stack. See docs/E2E-FRAMEWORK.md.
 */

function str(name: string, fallback = ""): string {
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : fallback;
}

function num(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const baseURL = str("E2E_BASE_URL", str("PLAYWRIGHT_BASE_URL", "https://www.dezhost.com")).replace(/\/$/, "");
const apiURL = str("E2E_API_URL", str("NEXT_PUBLIC_API_URL", `${baseURL}/api/v1`)).replace(/\/$/, "");

export const env = {
  baseURL,
  apiURL,

  admin: {
    email: str("E2E_ADMIN_EMAIL"),
    password: str("E2E_ADMIN_PASSWORD")
  },
  client: {
    email: str("E2E_CLIENT_EMAIL"),
    password: str("E2E_CLIENT_PASSWORD")
  },

  // Auth cookie names set by the web app (lib/api.ts storeAuth()).
  cookies: {
    clientAccess: "teculiar_client_access_token",
    clientRefresh: "teculiar_client_refresh_token",
    adminAccess: "teculiar_admin_access_token",
    adminRefresh: "teculiar_admin_refresh_token"
  },

  // Virtualmin admin API — used ONLY to tear down hosting accounts the suite created.
  virtualmin: {
    endpoint: str("VIRTUALMIN_ADMIN_ENDPOINT"),
    username: str("VIRTUALMIN_ADMIN_USERNAME"),
    password: str("VIRTUALMIN_ADMIN_PASSWORD"),
    allowSelfSigned: str("VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED", "1") === "1"
  },

  // Behaviour flags.
  flags: {
    // Enable the SANDBOX storefront gateway during the run so UI checkout can complete
    // deterministically. Restored to its prior state on teardown. Set 0 to leave prod untouched.
    enableSandbox: bool("E2E_ENABLE_SANDBOX", true),
    // Actually delete created Virtualmin hosting accounts after each test (default on).
    teardownHosting: bool("E2E_TEARDOWN_HOSTING", true)
  },

  // Timeouts / polling (no arbitrary sleeps — see helpers/polling.ts).
  timeouts: {
    // Category 4/5: wait up to 4 minutes for provisioning to reach ACTIVE.
    provisioningMs: num("E2E_PROVISIONING_TIMEOUT_MS", 240_000),
    pollIntervalMs: num("E2E_POLL_INTERVAL_MS", 5_000),
    apiMs: num("E2E_API_TIMEOUT_MS", 60_000),
    // The cron endpoint fans out to external services (Virtualmin/Resell.biz/mailboxes)
    // and can run for over a minute on production.
    cronMs: num("E2E_CRON_TIMEOUT_MS", 150_000)
  },

  // Hosting provisioning must be throttled hard: concurrent — or even rapid back-to-back —
  // Virtualmin create-domain calls race on the shared Apache config and corrupt it. The gate
  // holds a global lock through the WHOLE create (pay → wait until the account is ACTIVE →
  // settle for the Apache reload) so the next hosting create only starts once the previous one
  // has fully finished on the server. See helpers/provision-gate.ts.
  provision: {
    // Small pre-gap as a buffer; the real serialiser is the wait-until-ACTIVE below.
    hostingGapMs: num("E2E_HOSTING_PROVISION_GAP_MS", 8_000),
    // Held AFTER the account reports ACTIVE, to let the Apache graceful reload complete.
    hostingSettleMs: num("E2E_HOSTING_PROVISION_SETTLE_MS", 25_000),
    lockStaleMs: num("E2E_PROVISION_LOCK_STALE_MS", 600_000)
  },

  // Domain generation — only real TLDs, never subdomains. .de is registrar-manual so excluded.
  domains: {
    rootForUnique: str("E2E_DOMAIN_ROOT", "dezhost-e2e"),
    registerTld: str("E2E_REGISTER_TLD", "com"),
    transferTld: str("E2E_TRANSFER_TLD", "com"),
    // External/existing domains never touch a registrar, so any TLD is fine.
    externalTld: str("E2E_EXTERNAL_TLD", "com")
  },

  // Where the suite records created Virtualmin domains so global-teardown can sweep leftovers.
  artifacts: {
    createdHostingFile: "tests/e2e/results/created-virtualmin-domains.json",
    gatewayStateFile: "tests/e2e/results/sandbox-gateway-prior-state.json"
  }
} as const;

export type Env = typeof env;

/** Throws a clear error when a required credential is missing. */
export function requireCredentials(): void {
  const missing: string[] = [];
  if (!env.admin.email || !env.admin.password) missing.push("E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");
  if (!env.client.email || !env.client.password) missing.push("E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD");
  if (missing.length) {
    throw new Error(`Missing required E2E credentials: ${missing.join(", ")}. Set them in .env (see docs/E2E-FRAMEWORK.md).`);
  }
}
