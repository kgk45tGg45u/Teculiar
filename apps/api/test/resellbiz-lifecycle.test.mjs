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

test("Resell.biz test API uses safe fallback nameservers for default registration", async () => {
  const source = await readFile(new URL("../src/modules/external/resellbiz-provider.service.ts", import.meta.url), "utf8");

  assert.match(source, /isResellBizTestApi\(\)/);
  assert.match(source, /ns1\.domain\.com/);
  assert.match(source, /ns2\.domain\.com/);
});
