import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProductsService } from "../../src/modules/products/products.service";

describe("ProductsService status refresh", () => {
  it("refreshes hosting service and attached domain status from provider APIs", async () => {
    const events: string[] = [];
    const products = {
      findService: async () => ({
        configuration: { domainName: "refresh.test" },
        domainRecords: [{ domain: "refresh.test", id: "dom_1", status: "FAILED" }],
        externalId: "refresh.test",
        id: "svc_1",
        product: { type: "SHARED_HOSTING" },
        status: "FAILED",
        userId: "user_1"
      }),
      updateDomainRecordStatus: async (id: string, status: string, externalId?: string) => events.push(`domain:${id}:${status}:${externalId}`),
      updateServiceStatus: async (id: string, status: string, externalId?: string) => {
        events.push(`service:${id}:${status}:${externalId}`);
        return { id, status, externalId };
      }
    };
    const external = {
      hostingProvider: () => ({
        status: async (domain: string) => {
          events.push(`virtualmin:${domain}`);
          return { externalId: domain, metadata: {}, status: "ACTIVE" };
        }
      }),
      resellBiz: {
        status: async (domain: string) => {
          events.push(`resellbiz:${domain}`);
          return { externalId: "rb_1", metadata: {}, status: "ACTIVE" };
        }
      }
    };
    const service = new ProductsService(products as never, external as never);

    await service.refreshService("svc_1");

    assert.deepEqual(events, [
      "resellbiz:refresh.test",
      "domain:dom_1:ACTIVE:rb_1",
      "virtualmin:refresh.test",
      "service:svc_1:ACTIVE:refresh.test"
    ]);
  });

  it("daily refresh stores latest service statuses", async () => {
    const events: string[] = [];
    const products = {
      findService: async (id: string) => ({
        configuration: { domainName: `${id}.test` },
        domainRecords: [],
        externalId: `${id}.test`,
        id,
        product: { type: "SHARED_HOSTING" },
        status: "PROVISIONING",
        userId: "user_1"
      }),
      listServices: async () => [{ id: "svc_a" }, { id: "svc_b" }],
      updateServiceStatus: async (id: string, status: string) => {
        events.push(`${id}:${status}`);
        return { id, status };
      }
    };
    const external = {
      hostingProvider: () => ({ status: async () => ({ externalId: "ok", metadata: {}, status: "ACTIVE" }) }),
      resellBiz: {}
    };
    const service = new ProductsService(products as never, external as never);

    const result = await service.refreshAllServiceStatuses();

    assert.equal(result.checked, 2);
    assert.deepEqual(events, ["svc_a:ACTIVE", "svc_b:ACTIVE"]);
  });
});
