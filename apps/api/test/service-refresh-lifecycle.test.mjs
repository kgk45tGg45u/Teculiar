import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ProductsService } from "../dist/modules/products/products.service.js";

test("client service list returns stored rows without probing providers by default", async () => {
  const calls = [];
  const rows = [{ id: "service-1", status: "PENDING", userId: "user-1" }];
  const products = {
    listServices: async (userId) => {
      calls.push(["list", userId]);
      return rows;
    }
  };
  const service = new ProductsService(products, {});

  const result = await service.listServices("user-1");

  assert.equal(result, rows);
  assert.deepEqual(calls, [["list", "user-1"]]);
});

test("service refresh does not return another client's service", async () => {
  const calls = [];
  const products = {
    findService: async () => ({
      configuration: { domainName: "other-client.example.com" },
      domainRecords: [],
      id: "service-1",
      product: { type: "SHARED_HOSTING" },
      status: "PENDING",
      userId: "other-user"
    }),
    updateServiceStatus: async () => calls.push(["update"])
  };
  const external = {
    hostingProvider: () => ({
      status: async () => {
        calls.push(["provider"]);
        return { externalId: "other-client.example.com", status: "ACTIVE" };
      }
    }),
    resellBiz: {}
  };

  const service = new ProductsService(products, external);
  const refreshed = await service.refreshService("service-1", "user-1");

  assert.equal(refreshed, null);
  assert.deepEqual(calls, []);
});

test("client dashboard only probes provider from service pages once", async () => {
  const source = await readFile(new URL("../../web/components/portal/client-dashboard.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /setInterval\(loadServices,\s*20_000\)/);
  assert.doesNotMatch(source, /setInterval\(loadService,\s*20_000\)/);
  assert.match(source, /function serviceListUrl/);
  assert.match(source, /view === "services" && !serviceId/);
  assert.match(source, /\/services\?refresh=1/);
  assert.match(source, /\/services\/\$\{serviceId\}\?refresh=1/);
  assert.doesNotMatch(source, /loadServicesFresh/);
  assert.doesNotMatch(source, /loadServiceFresh/);
});

test("active hosting service is not kept active when Virtualmin cannot find it", async () => {
  const calls = [];
  const products = {
    findService: async () => ({
      configuration: { domainName: "missing-host.example.com" },
      domainRecords: [],
      externalId: "missing-host.example.com",
      id: "service-1",
      product: { type: "SHARED_HOSTING" },
      status: "ACTIVE",
      userId: "user-1"
    }),
    updateServiceStatus: async (id, status, externalId) => {
      calls.push([id, status, externalId]);
      return { id, status, externalId };
    }
  };
  const external = {
    hostingProvider: () => ({
      status: async () => ({ externalId: "missing-host.example.com", status: "PROVISIONING" })
    }),
    resellBiz: {}
  };

  const service = new ProductsService(products, external);
  const refreshed = await service.refreshService("service-1", "user-1");

  assert.deepEqual(calls, [["service-1", "PROVISIONING", "missing-host.example.com"]]);
  assert.equal(refreshed.status, "PROVISIONING");
});

test("hosting refresh does not activate while Virtualmin create log is still running", async () => {
  const calls = [];
  const products = {
    findRunningModuleLogForService: async (serviceId, action) => ({ action, serviceId, status: "RUNNING" }),
    findService: async () => ({
      configuration: { domainName: "pending-host.example.com" },
      domainRecords: [],
      externalId: "pending-host.example.com",
      id: "service-1",
      product: { type: "SHARED_HOSTING" },
      status: "PROVISIONING",
      userId: "user-1"
    }),
    updateServiceStatus: async (id, status, externalId) => {
      calls.push([id, status, externalId]);
      return { id, status, externalId };
    }
  };
  const external = {
    hostingProvider: () => ({
      status: async () => {
        calls.push(["provider-status"]);
        return { externalId: "pending-host.example.com", status: "ACTIVE" };
      }
    }),
    resellBiz: {}
  };

  const service = new ProductsService(products, external);
  const refreshed = await service.refreshService("service-1", "user-1");

  assert.deepEqual(calls, []);
  assert.equal(refreshed.status, "PROVISIONING");
});

test("paid hosting invoice without provider module does not mark service active", async () => {
  const calls = [];
  const invoice = {
    customerSnapshot: { email: "owner@example.com", name: "Owner Example" },
    dueAt: new Date(Date.now() + 60_000),
    id: "invoice-hosting",
    items: [
      {
        lifecycleAction: "create",
        orderItem: { id: "item-1" },
        service: {
          configuration: { domainName: "owner-example.com" },
          id: "service-1",
          product: { type: "SHARED_HOSTING" },
          status: "PENDING"
        },
        type: "SERVICE"
      }
    ],
    order: { id: "order-1", items: [] },
    status: "PAID"
  };
  const billing = {
    createAuditLog: async (input) => calls.push(["audit", input.action]),
    createModuleLog: async (input) => {
      calls.push(["module", input.action, input.moduleName, input.request.options.domainName]);
      return { id: "log-1" };
    },
    failModuleLog: async () => calls.push(["fail"]),
    findInvoiceForLifecycle: async () => invoice,
    findModuleLogByKey: async () => null,
    setOrderItemLifecycleStatus: async (id, status) => calls.push(["item", id, status]),
    setOrderLifecycleStatus: async (id, status) => calls.push(["order", id, status]),
    setServiceLifecycleStatus: async (id, status) => calls.push(["service", id, status]),
    succeedModuleLog: async (id, response) => calls.push(["success", id, response.status])
  };
  const { BillingService } = await import("../dist/modules/billing/billing.service.js");
  const service = new BillingService(billing, {}, {});

  await service.onInvoicePaid("invoice-hosting", { source: "gateway" });

  assert.deepEqual(calls, [
    ["audit", "invoice.paid"],
    ["module", "create", "virtualmin", "owner-example.com"],
    ["success", "log-1", "QUEUED"],
    ["service", "service-1", "PROVISIONING"],
    ["item", "item-1", "PROVISIONING"],
    ["audit", "service.provisioning_queued"],
    ["order", "order-1", "PROVISIONING"]
  ]);
});

test("manual service creation uses category module before legacy product module", async () => {
  const calls = [];
  const products = {
    createService: async () => ({ id: "service-1" }),
    findProduct: async () => ({
      category: { provisioningModule: "hetzner" },
      id: "product-1",
      provisioningModule: "virtualmin",
      type: "SHARED_HOSTING"
    }),
    updateServiceStatus: async (id, status, externalId) => {
      calls.push(["update", id, status, externalId]);
      return { externalId, id, status };
    }
  };
  const external = {
    hostingProvider: (moduleName, productType) => {
      calls.push(["provider", moduleName, productType]);
      return {
        provision: async (request) => {
          calls.push(["provision", request.productType, request.serviceId]);
          return { externalId: "host-1", status: "ACTIVE" };
        }
      };
    }
  };

  const service = new ProductsService(products, external);
  const result = await service.createService({
    configuration: { domainName: "owner-example.com" },
    productId: "product-1",
    productPriceId: "price-1",
    userId: "user-1"
  });

  assert.deepEqual(calls, [
    ["provider", "hetzner", "SHARED_HOSTING"],
    ["provision", "SHARED_HOSTING", "service-1"],
    ["update", "service-1", "ACTIVE", "host-1"]
  ]);
  assert.equal(result.status, "ACTIVE");
});

test("paid service lifecycle uses category module before legacy product module", async () => {
  const calls = [];
  const invoice = {
    customerSnapshot: { email: "owner@example.com", name: "Owner Example" },
    dueAt: new Date(Date.now() + 60_000),
    id: "invoice-hosting-category",
    items: [
      {
        lifecycleAction: "create",
        orderItem: { id: "item-1" },
        service: {
          configuration: { domainName: "owner-example.com" },
          id: "service-1",
          product: {
            category: { provisioningModule: "hetzner" },
            provisioningModule: "virtualmin",
            type: "SHARED_HOSTING"
          },
          status: "PENDING"
        },
        type: "SERVICE"
      }
    ],
    order: { id: "order-1", items: [] },
    status: "PAID"
  };
  const billing = {
    createAuditLog: async (input) => calls.push(["audit", input.action, input.metadata?.moduleName]),
    createModuleLog: async (input) => {
      calls.push(["module", input.action, input.moduleName]);
      return { id: "log-1" };
    },
    failModuleLog: async () => calls.push(["fail"]),
    findInvoiceForLifecycle: async () => invoice,
    findModuleLogByKey: async () => null,
    setOrderItemLifecycleStatus: async (id, status) => calls.push(["item", id, status]),
    setOrderLifecycleStatus: async (id, status) => calls.push(["order", id, status]),
    setServiceLifecycleStatus: async (id, status, input) => calls.push(["service", id, status, input.externalId]),
    succeedModuleLog: async (id, response) => calls.push(["success", id, response.status])
  };
  const external = {
    hetzner: {
      provision: async () => {
        calls.push(["hetzner"]);
        return { externalId: "hz-1", status: "ACTIVE" };
      }
    },
    virtualmin: {
      provision: async () => {
        calls.push(["virtualmin"]);
        return { externalId: "vm-1", status: "ACTIVE" };
      }
    }
  };
  const { BillingService } = await import("../dist/modules/billing/billing.service.js");
  const service = new BillingService(billing, {}, {}, external);

  await service.onInvoicePaid("invoice-hosting-category", { source: "gateway" });

  assert.deepEqual(calls, [
    ["audit", "invoice.paid", undefined],
    ["module", "create", "hetzner"],
    ["hetzner"],
    ["success", "log-1", "ACTIVE"],
    ["service", "service-1", "ACTIVE", "hz-1"],
    ["item", "item-1", "ACTIVE"],
    ["audit", "service.activated", "hetzner"],
    ["order", "order-1", "COMPLETE"]
  ]);
});
