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
