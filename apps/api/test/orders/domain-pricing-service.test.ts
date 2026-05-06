import { strict as assert } from "node:assert";
import test from "node:test";
import { DomainPricingService } from "../../src/modules/orders/domain-pricing.service";

test("minimumRegisterPrice ignores zero placeholder prices", async () => {
  let query = "";
  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      query = strings.join("?");
      return [{ amountCents: 999 }];
    }
  };
  const service = new DomainPricingService(prisma as never);

  const result = await service.minimumRegisterPrice();

  assert.equal(result, 999);
  assert.match(query, /"amountCents"\s*>\s*0/);
});
