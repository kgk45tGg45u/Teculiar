import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";

test("paid domain invoice registers through Resell.biz and updates lifecycle state", async () => {
  const calls = [];
  const invoice = {
    customerSnapshot: {
      address: { city: "Berlin", line1: "Example Str. 1", postalCode: "10115" },
      countryCode: "DE",
      email: "owner@example.com",
      name: "Owner Example",
      phone: "+49 30123456"
    },
    dueAt: new Date(Date.now() + 60_000),
    id: "invoice-domain",
    items: [
      {
        domainRecord: {
          domain: "owner-example.com",
          id: "domain-1",
          nameservers: ["ns1.domain.com", "ns2.domain.com"],
          registrarModule: "resellbiz",
          registrationPeriodYears: 1,
          status: "PENDING",
          type: "register"
        },
        domainRecordId: "domain-1",
        lifecycleAction: "register",
        orderItem: { id: "item-1" },
        orderItemId: "item-1",
        service: { id: "service-1", status: "PENDING" },
        serviceId: "service-1",
        type: "DOMAIN"
      }
    ],
    order: { id: "order-1", items: [] },
    paidAt: new Date(),
    status: "PAID"
  };
  const billing = {
    createAuditLog: async (input) => calls.push(["audit", input.action]),
    createModuleLog: async (input) => {
      calls.push(["module", input.action, input.moduleName, input.request.domain]);
      return { id: "log-1" };
    },
    failModuleLog: async () => calls.push(["fail"]),
    findInvoiceForLifecycle: async () => invoice,
    findModuleLogByKey: async () => null,
    setDomainLifecycleStatus: async (id, status, input) => calls.push(["domain", id, status, input.externalId]),
    setOrderItemLifecycleStatus: async (id, status, input) => calls.push(["item", id, status, input.providerReference]),
    setOrderLifecycleStatus: async (id, status) => calls.push(["order", id, status]),
    setServiceLifecycleStatus: async (id, status, input) => calls.push(["service", id, status, input.externalId]),
    succeedModuleLog: async (id, response) => calls.push(["success", id, response.externalId])
  };
  const external = {
    resellBiz: {
      register: async (request) => {
        calls.push(["register", request.domain, request.years, request.nameServers.join(",")]);
        return { externalId: "rb-100", metadata: { testApi: true }, status: "ACTIVE" };
      }
    }
  };

  const service = new BillingService(billing, {}, {}, external);
  await service.onInvoicePaid("invoice-domain", { source: "gateway" });

  assert.deepEqual(calls, [
    ["audit", "invoice.paid"],
    ["audit", "domain.registrar_started"],
    ["module", "register_domain", "resellbiz", "owner-example.com"],
    ["register", "owner-example.com", 1, "ns1.domain.com,ns2.domain.com"],
    ["success", "log-1", "rb-100"],
    ["domain", "domain-1", "ACTIVE", "rb-100"],
    ["service", "service-1", "ACTIVE", "rb-100"],
    ["item", "item-1", "ACTIVE", "rb-100"],
    ["audit", "domain.registered"],
    ["order", "order-1", "COMPLETE"]
  ]);
});

test("paid bundled order starts Resell.biz even when Virtualmin is slow", async () => {
  const calls = [];
  const invoice = {
    customerSnapshot: {
      address: { city: "Berlin", line1: "Example Str. 1", postalCode: "10115" },
      countryCode: "DE",
      email: "owner@example.com",
      name: "Owner Example",
      phone: "+49 30123456"
    },
    dueAt: new Date(Date.now() + 60_000),
    id: "invoice-bundle",
    items: [
      {
        lifecycleAction: "create",
        orderItem: { id: "hosting-item" },
        service: {
          configuration: { domainName: "bundle-example.com" },
          id: "hosting-service",
          product: { type: "SHARED_HOSTING" },
          status: "PENDING"
        },
        type: "SERVICE"
      },
      {
        domainRecord: {
          domain: "bundle-example.com",
          id: "domain-1",
          registrarModule: "resellbiz",
          registrationPeriodYears: 1,
          status: "PENDING",
          type: "register"
        },
        lifecycleAction: "register",
        orderItem: { id: "domain-item" },
        service: { id: "domain-service", product: { type: "DOMAIN" }, status: "PENDING" },
        type: "DOMAIN"
      }
    ],
    order: { id: "order-1", items: [] },
    status: "PAID"
  };
  const billing = {
    createAuditLog: async (input) => calls.push(["audit", input.action]),
    createModuleLog: async (input) => {
      calls.push(["module", input.action, input.moduleName]);
      return { id: `${input.action}-log` };
    },
    failModuleLog: async () => calls.push(["fail"]),
    findInvoiceForLifecycle: async () => invoice,
    findModuleLogByKey: async () => null,
    setDomainLifecycleStatus: async (_id, status) => calls.push(["domain", status]),
    setOrderItemLifecycleStatus: async (_id, status) => calls.push(["item", status]),
    setOrderLifecycleStatus: async (_id, status) => calls.push(["order", status]),
    setServiceLifecycleStatus: async (_id, status) => calls.push(["service", status]),
    succeedModuleLog: async (_id, response) => calls.push(["success", response.status])
  };
  const external = {
    resellBiz: {
      register: async () => {
        calls.push(["register"]);
        return { externalId: "rb-200", metadata: {}, status: "ACTIVE" };
      }
    },
    virtualmin: {
      provision: async () => {
        calls.push(["virtualmin-start"]);
        await new Promise((resolve) => setTimeout(resolve, 25));
        calls.push(["virtualmin-end"]);
        return { externalId: "bundle-example.com", metadata: {}, status: "ACTIVE" };
      }
    }
  };
  const service = new BillingService(billing, {}, {}, external);

  await service.onInvoicePaid("invoice-bundle", { source: "gateway" });

  assert.ok(calls.findIndex((call) => call[0] === "register") > -1);
  assert.ok(calls.findIndex((call) => call[0] === "register") < calls.findIndex((call) => call[0] === "virtualmin-end"));
});

test("Resell.biz registration resolves name servers via the module registry (no ns1/ns2.domain.com)", async () => {
  const source = await readFile(new URL("../src/modules/external/resellbiz-provider.service.ts", import.meta.url), "utf8");

  // Name servers now come from resolveNameServers(customer, configured default) — the ns5/ns6.dezhost.com
  // fallback lives in the registry. The old test-API stub (ns1/ns2.domain.com) is gone.
  assert.match(source, /resolveNameServers\(request\.nameServers, config\.defaultNs\)/);
  assert.doesNotMatch(source, /ns1\.domain\.com/);
  assert.doesNotMatch(source, /isResellBizTestApi/);
});

test("failed Resell.biz paid lifecycle keeps domain service pending and logs failure", async () => {
  const calls = [];
  const invoice = {
    customerSnapshot: {
      address: { city: "Berlin", line1: "Example Str. 1", postalCode: "10115" },
      countryCode: "DE",
      email: "owner@example.com",
      name: "Owner Example",
      phone: "+49 30123456"
    },
    dueAt: new Date(Date.now() + 60_000),
    id: "invoice-domain-fail",
    items: [
      {
        domainRecord: {
          domain: "broken-example.com",
          id: "domain-1",
          registrarModule: "resellbiz",
          registrationPeriodYears: 1,
          status: "PENDING",
          type: "register"
        },
        lifecycleAction: "register",
        orderItem: { id: "item-1" },
        service: { id: "service-1", product: { type: "DOMAIN" }, status: "PENDING" },
        type: "DOMAIN"
      }
    ],
    order: { id: "order-1", items: [] },
    paidAt: new Date(),
    status: "PAID"
  };
  const billing = {
    createAuditLog: async (input) => calls.push(["audit", input.action, input.metadata?.error]),
    createModuleLog: async (input) => {
      calls.push(["module", input.action, input.moduleName]);
      return { id: "log-1" };
    },
    failModuleLog: async (id, message) => calls.push(["fail-log", id, message]),
    findInvoiceForLifecycle: async () => invoice,
    findModuleLogByKey: async () => null,
    setDomainLifecycleStatus: async (id, status) => calls.push(["domain", id, status]),
    setOrderItemLifecycleStatus: async (id, status, input) => calls.push(["item", id, status, input.errorMessage]),
    setOrderLifecycleStatus: async (id, status, notes) => calls.push(["order", id, status, notes]),
    setServiceLifecycleStatus: async (id, status) => calls.push(["service", id, status]),
    succeedModuleLog: async () => calls.push(["unexpected-success"])
  };
  const external = {
    resellBiz: {
      register: async () => {
        throw new Error("test registrar outage");
      }
    }
  };

  const service = new BillingService(billing, {}, {}, external);
  await service.onInvoicePaid("invoice-domain-fail", { source: "gateway" });

  assert.deepEqual(calls, [
    ["audit", "invoice.paid", undefined],
    ["audit", "domain.registrar_started", undefined],
    ["module", "register_domain", "resellbiz"],
    ["fail-log", "log-1", "test registrar outage"],
    ["domain", "domain-1", "PENDING"],
    ["service", "service-1", "PROVISIONING"],
    ["item", "item-1", "FAILED", "test registrar outage"],
    ["audit", "domain.registrar_failed", "test registrar outage"],
    ["order", "order-1", "PROVISIONING", "At least one paid invoice action failed."]
  ]);
});
