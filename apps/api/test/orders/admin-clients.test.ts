import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UsersService } from "../../src/modules/users/users.service";
import { OrdersService } from "../../src/modules/orders/orders.service";

describe("Admin clients", () => {
  it("lists clients with statistics and supports client CRUD service calls", async () => {
    const events: string[] = [];
    const users = {
      createClient: async (input: { email: string; passwordHash: string }) => {
        events.push(`create:${input.email}:${Boolean(input.passwordHash)}`);
        return { id: "user_1", email: input.email };
      },
      deleteClient: async (id: string) => {
        events.push(`delete:${id}`);
        return { id };
      },
      findClient: async (id: string) => ({ email: "client@example.test", id }),
      listClients: async () => [
        {
          domainRecords: [{ id: "dom_1" }],
          email: "client@example.test",
          id: "user_1",
          invoices: [{ status: "UNPAID", totalCents: 1190 }, { status: "PAID", totalCents: 2380 }],
          name: "Client",
          services: [{ status: "ACTIVE" }, { status: "PENDING" }]
        }
      ],
      updateClient: async (id: string, input: { segment?: string }) => {
        events.push(`update:${id}:${input.segment}`);
        return { id, ...input };
      },
      updateSegment: async () => undefined
    };
    const service = new UsersService(users as never);

    const created = await service.createClient({
      email: "client@example.test",
      name: "Client",
      password: "StrongPass1!"
    });
    const clients = await service.listClients();
    await service.updateClient("user_1", { segment: "vip" });
    await service.deleteClient("user_1");

    assert.equal(created.email, "client@example.test");
    assert.equal(clients[0]?.services.length, 2);
    assert.deepEqual(events, ["create:client@example.test:true", "update:user_1:vip", "delete:user_1"]);
  });

  it("admin-created orders create unpaid invoice and pending entities for a chosen client", async () => {
    const events: string[] = [];
    const orders = {
      createOrder: async (input: { items: Array<{ type: string }>; userId: string }) => {
        events.push(`order:${input.userId}:${input.items.map((item) => item.type).join("+")}`);
        return { id: "ord_admin", items: input.items.map((item, index) => ({ ...item, id: `item_${index}` })), userId: input.userId };
      },
      createPendingEntitiesForOrder: async (_order: unknown, invoiceId: string) => events.push(`pending:${invoiceId}`),
      findProduct: async (id: string) =>
        id === "prod_domain" ? product("prod_domain", "DOMAIN", 1200, "YEAR_1") : product("prod_hosting", "SHARED_HOSTING", 1000, "MONTHLY")
    };
    const billing = {
      createInvoice: async (input: { lines: Array<{ type?: string }>; status: string; userId: string }) => {
        events.push(`invoice:${input.userId}:${input.status}:${input.lines.map((line) => line.type).join("+")}`);
        return { id: "inv_admin", subtotalCents: 2200, taxAmountCents: 418, totalCents: 2618 };
      },
      vatPercent: async () => 19
    };
    const users = {
      findById: async () => ({
        contacts: [{ address: { city: "Berlin", line1: "Main 1", postalCode: "10115", state: "Berlin" }, phone: "+49 30123456" }],
        countryCode: "DE",
        customerType: "BUSINESS",
        email: "admin-order@example.test",
        id: "user_admin",
        name: "Admin Client",
        vatId: "DE123"
      })
    };
    const domainPricing = {
      priceFor: async (_domain: string, fallback: number) => ({ amountCents: fallback, source: "stored", tld: "test" })
    };
    const service = new OrdersService(orders as never, billing as never, {} as never, users as never, domainPricing as never);

    await service.createAdminOrder({
      items: [
        { configuration: { domainName: "admin-flow.test" }, productId: "prod_hosting", quantity: 1 },
        { domainName: "admin-flow.test", productId: "prod_domain", quantity: 1 }
      ],
      userId: "user_admin"
    });

    assert.deepEqual(events, [
      "invoice:user_admin:UNPAID:SERVICE+DOMAIN",
      "order:user_admin:SHARED_HOSTING+DOMAIN",
      "pending:inv_admin"
    ]);
  });

  it("admin monthly hosting plus domain order invoices hosting monthly and domain yearly", async () => {
    const lines: Array<{ billingCycle?: string; description: string; type?: string; unitAmountCents: number }> = [];
    const itemsSeen: Array<{ billingCycle: string; type: string }> = [];
    const orders = {
      createOrder: async (input: { items: Array<{ billingCycle: string; type: string }>; userId: string }) => {
        itemsSeen.push(...input.items);
        return { id: "ord_cycles", items: input.items.map((item, index) => ({ ...item, id: `item_${index}` })), userId: input.userId };
      },
      createPendingEntitiesForOrder: async () => undefined,
      findProduct: async (id: string) =>
        id === "prod_domain"
          ? product("prod_domain", "DOMAIN", 1200, "YEAR_1")
          : product("prod_hosting", "SHARED_HOSTING", 999, "MONTHLY")
    };
    const billing = {
      createInvoice: async (input: { lines: typeof lines }) => {
        lines.push(...input.lines);
        return { id: "inv_cycles", subtotalCents: 2199, taxAmountCents: 418, totalCents: 2617 };
      },
      vatPercent: async () => 19
    };
    const users = {
      findById: async () => ({
        contacts: [{ address: { city: "Berlin", line1: "Main 1", postalCode: "10115", state: "Berlin" }, phone: "+49 30123456" }],
        countryCode: "DE",
        customerType: "INDIVIDUAL",
        email: "cycles@example.test",
        id: "user_cycles",
        name: "Cycle Client"
      })
    };
    const domainPricing = {
      priceFor: async (_domain: string, fallback: number) => ({ amountCents: fallback, source: "stored", tld: "test" })
    };
    const service = new OrdersService(orders as never, billing as never, {} as never, users as never, domainPricing as never);

    await service.createAdminOrder({
      items: [
        { configuration: { domainName: "cycles.test" }, productId: "prod_hosting", quantity: 1 },
        { configuration: { domainAction: "register" }, domainName: "cycles.test", productId: "prod_domain", quantity: 1 }
      ],
      userId: "user_cycles"
    });

    assert.deepEqual(itemsSeen.map((item) => `${item.type}:${item.billingCycle}`), ["SHARED_HOSTING:MONTHLY", "DOMAIN:YEAR_1"]);
    assert.deepEqual(lines.map((line) => `${line.type}:${line.billingCycle}:${line.unitAmountCents}`), ["SERVICE:MONTHLY:999", "DOMAIN:YEAR_1:1200"]);
  });
});

function product(id: string, type: string, amountCents: number, billingCycle: string) {
  return {
    id,
    name: id,
    prices: [{ amountCents, billingCycle, id: `price_${id}`, setupFeeCents: 0 }],
    type
  };
}
