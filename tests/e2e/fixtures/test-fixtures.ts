/**
 * The suite's custom `test` — extends Playwright with API clients, the resolved
 * catalogue, reusable checkout dependencies, page objects, and (critically) a
 * per-test teardown that removes any Virtualmin hosting account the test created.
 *
 * Import this instead of "@playwright/test":
 *   import { test, expect } from "../../fixtures/test-fixtures";
 */
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { env } from "../config/env";
import { ApiClient } from "../helpers/api-client";
import { deleteVirtualminDomains } from "../helpers/virtualmin";
import { recordCreatedHostingDomain } from "../helpers/teardown-registry";
import { resolveCatalog, type Catalog } from "../flows/catalog.flow";
import type { CheckoutDeps } from "../flows/checkout.flow";
import { CheckoutPage } from "../pages/checkout.page";
import { LoginPage } from "../pages/login.page";
import { ClientPortalPage } from "../pages/client-portal.page";
import { AdminPage } from "../pages/admin.page";

export type Teardown = {
  /** Mark a Virtualmin domain for deletion after this test (also persisted for the global sweep). */
  registerHostingDomain: (domain: string) => void;
  /** Domains registered so far in this test. */
  domains: string[];
};

type Fixtures = {
  api: ApiClient;                  // anonymous (no token)
  makeApi: () => ApiClient;        // fresh anonymous client with its own token slot
  adminApi: ApiClient;             // authenticated admin
  clientApi: ApiClient;            // authenticated shared E2E client
  catalog: Catalog;
  teardown: Teardown;
  checkoutDeps: CheckoutDeps;
  checkoutPage: CheckoutPage;
  loginPage: LoginPage;
  portalPage: ClientPortalPage;
  adminPage: AdminPage;
};

const client = (request: APIRequestContext) => new ApiClient(request);

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(client(request));
  },

  makeApi: async ({ request }, use) => {
    await use(() => client(request));
  },

  adminApi: async ({ request }, use) => {
    const api = client(request);
    await api.login(env.admin.email, env.admin.password);
    await use(api);
  },

  clientApi: async ({ request }, use) => {
    const api = client(request);
    await api.login(env.client.email, env.client.password);
    await use(api);
  },

  catalog: async ({ request }, use) => {
    await use(await resolveCatalog(client(request)));
  },

  teardown: async ({}, use) => {
    const domains: string[] = [];
    const registerHostingDomain = (domain: string) => {
      if (!domain || domains.includes(domain)) return;
      domains.push(domain);
      recordCreatedHostingDomain(domain); // crash-safe persistence for the global sweep
    };
    await use({ registerHostingDomain, domains });

    // Remove every hosting account this test provisioned on the real panel.
    if (env.flags.teardownHosting && domains.length) {
      const results = await deleteVirtualminDomains(domains);
      const failed = results.filter((r) => !r.ok && !r.skipped);
      if (failed.length) {
        // Don't fail the test on cleanup issues — the global sweep is the backstop —
        // but surface it loudly in the report.
        console.warn(`[teardown] Virtualmin delete incomplete: ${failed.map((f) => `${f.domain} (${f.message})`).join("; ")}`);
      }
    }
  },

  checkoutDeps: async ({ api, makeApi, catalog, teardown }, use) => {
    await use({ anonApi: api, makeApi, catalog, registerTeardownDomain: teardown.registerHostingDomain });
  },

  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  portalPage: async ({ page }, use) => {
    await use(new ClientPortalPage(page));
  },
  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  }
});

export { expect };
