import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProductsService } from "../../src/modules/products/products.service";

describe("ProductsService service status refresh", () => {
  it("marks provisioning hosting active when Virtualmin reports the domain exists", async () => {
    const events: string[] = [];
    const service = {
      configuration: { domainName: "fresh-example.com" },
      externalId: null,
      id: "svc_1",
      product: { type: "SHARED_HOSTING" },
      status: "PROVISIONING",
      userId: "user_1"
    };
    const products = {
      findService: async () => service,
      updateServiceStatus: async (id: string, status: string, externalId?: string) => {
        events.push(`${id}:${status}:${externalId}`);
        return { ...service, externalId, status };
      }
    };
    const external = {
      hostingProvider: () => ({
        status: async () => ({ externalId: "fresh-example.com", status: "ACTIVE" })
      })
    };
    const productsService = new ProductsService(products as never, external as never);

    const result = await productsService.refreshService("svc_1", "user_1");

    assert.equal(result?.status, "ACTIVE");
    assert.deepEqual(events, ["svc_1:ACTIVE:fresh-example.com"]);
  });
});

describe("ProductsService Virtualmin plan sync", () => {
  it("maps Virtualmin plan limits to customer-friendly package options", async () => {
    const saved: unknown[] = [];
    const products = {
      syncHostingPlanProduct: async (input: unknown) => {
        saved.push(input);
        return input;
      }
    };
    const external = {
      virtualmin: {
        listHostingTemplates: async () => ({
          plans: [
            {
              id: "basic",
              limits: {
                databases: "5",
                disk: "10 GB",
                mailboxes: "20",
                subServers: "3"
              },
              name: "Basic"
            }
          ],
          templates: []
        })
      }
    };
    const productsService = new ProductsService(products as never, external as never);

    await productsService.syncVirtualminHostingPlans();

    assert.deepEqual(saved, [
      {
        configs: [
          { key: "disk_space", label: "Storage", required: false, values: ["10 GB"] },
          { key: "databases", label: "Databases", required: false, values: ["5"] },
          { key: "mailboxes", label: "Email accounts", required: false, values: ["20"] },
          { key: "subdomains", label: "Subdomains", required: false, values: ["3"] },
          { key: "virtualmin_plan", label: "Virtualmin Plan", required: true, values: ["basic"] }
        ],
        description: "Hosting package synced from Virtualmin plan Basic.",
        name: "Basic",
        planId: "basic",
        slug: "hosting-basic"
      }
    ]);
  });

  it("detects real Virtualmin plan names from the values payload before saving", async () => {
    const products = {
      syncHostingPlanProduct: async (input: unknown) => input
    };
    const external = {
      virtualmin: {
        listHostingTemplates: async () => ({
          plans: [
            {
              id: "0",
              limits: {},
              name: "0",
              raw: {
                values: JSON.stringify({
                  maximum_bw: ["107374182400"],
                  maximum_dbs: ["1"],
                  maximum_mailbox: ["3"],
                  name: ["Silber"],
                  server_quota: ["10 GiB"]
                })
              }
            },
            {
              id: "1773852498146755",
              limits: {},
              name: "1773852498146755",
              raw: {
                values: JSON.stringify({
                  maximum_bw: ["322122547200"],
                  maximum_dbs: ["3"],
                  maximum_mailbox: ["10"],
                  name: ["Gold"],
                  server_quota: ["50 GiB"]
                })
              }
            }
          ],
          templates: []
        })
      }
    };
    const productsService = new ProductsService(products as never, external as never);

    const detected = await productsService.detectVirtualminHostingPlans();
    const synced = await productsService.syncVirtualminHostingPlans(detected.plans);

    assert.equal(detected.plans[0]?.name, "Silber");
    assert.deepEqual(detected.plans[0]?.differences.map((item) => item.label), ["Storage", "Bandwidth", "Databases", "Email accounts"]);
    assert.equal(synced.products[0]?.name, "Silber");
  });
});

describe("ProductsService hosting control panel", () => {
  it("loads Virtualmin controls for active shared hosting services", async () => {
    const service = {
      configuration: { domainName: "site.example" },
      id: "svc_1",
      product: { type: "SHARED_HOSTING" },
      status: "ACTIVE",
      userId: "user_1"
    };
    const products = { findService: async () => service };
    const external = {
      virtualmin: {
        hostingControlPanel: async (domain: string) => ({ controlPanelUrl: `https://panel.example:10000/${domain}`, domain })
      }
    };
    const productsService = new ProductsService(products as never, external as never);

    const panel = await productsService.hostingControlPanel("svc_1", { roles: ["client"], sub: "user_1" });

    assert.equal(panel.controlPanelUrl, "https://panel.example:10000/site.example");
  });
});
