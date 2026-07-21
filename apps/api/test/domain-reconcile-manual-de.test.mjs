import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";

// Regression: a paid .de domain was getting CANCELLED on the first status-reconcile cron pass.
// .de is registered MANUALLY (never on the resell.biz panel), so probing the registrar returns
// "doesn't exist" → CANCELLED. refreshAllDomainStatuses must SKIP .de and only reconcile domains
// the registrar actually manages.
function buildService({ domains, providerStatus }) {
  const calls = [];
  const products = {
    listDomainRecords: async () => domains,
    updateDomainRecordStatus: async (id, status) => calls.push(["updateDomain", id, status]),
    updateServiceStatus: async (id, status) => calls.push(["updateService", id, status])
  };
  const external = {
    registrarProvider: () => ({
      status: async (domain) => {
        calls.push(["probe", domain]);
        return providerStatus;
      }
    })
  };
  const modules = { activeModuleNames: async () => ["resellbiz"] };
  return { service: new ProductsService(products, external, modules), calls };
}

test("reconcile skips manual .de domains — never probes registrar, never cancels", async () => {
  const { service, calls } = buildService({
    domains: [{
      id: "dom-de",
      domain: "wildebrennnesswg.de",
      status: "PENDING",
      registrarModule: "resellbiz",
      service: { id: "svc-de", product: { type: "DOMAIN" } }
    }],
    providerStatus: { externalId: "", status: "CANCELLED" }
  });

  const result = await service.refreshAllDomainStatuses();

  assert.deepEqual(calls, []); // no probe, no status write
  assert.equal(result.checked, 0);
});

test("reconcile still cancels a non-.de domain that the registrar reports gone", async () => {
  const { service, calls } = buildService({
    domains: [{
      id: "dom-com",
      domain: "gone.com",
      status: "ACTIVE",
      registrarModule: "resellbiz",
      service: { id: "svc-com", product: { type: "DOMAIN" } }
    }],
    providerStatus: { externalId: "", status: "CANCELLED" }
  });

  await service.refreshAllDomainStatuses();

  assert.deepEqual(calls, [
    ["probe", "gone.com"],
    ["updateDomain", "dom-com", "CANCELLED"],
    ["updateService", "svc-com", "CANCELLED"]
  ]);
});
