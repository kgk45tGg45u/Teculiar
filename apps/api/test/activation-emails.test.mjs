import assert from "node:assert/strict";
import { test } from "node:test";
import { BillingService } from "../dist/modules/billing/billing.service.js";

// The hosting/domain activation emails must fire exactly once whichever path marked the account
// ACTIVE (immediate provisioning, the status-reconciliation cron, or a client-triggered refresh),
// and must carry the control-panel credentials / name servers and a dashboard link.

test("notifyServiceActivated sends hosting email with control panel access and is idempotent", async () => {
  const dispatched = [];
  const audits = new Set();
  const billing = {
    hasAuditLog: async (action, id) => audits.has(`${action}:${id}`),
    serviceForEmail: async (id) => ({
      id,
      userId: "user-1",
      status: "ACTIVE",
      product: { type: "SHARED_HOSTING", name: "Web Hosting M" },
      configuration: { domainName: "example.com", hosting: { controlPanelUrl: "https://panel.dezhost.com:10000", username: "exampleadm", password: "Secret9!" } },
      domainRecords: [{ domain: "example.com" }],
      user: { id: "user-1", email: "client@example.com", name: "Client One" }
    }),
    createAuditLog: async ({ action, subjectId }) => audits.add(`${action}:${subjectId}`),
    mergeServiceConfiguration: async () => {}
  };
  const emails = { dispatch: async (key, payload) => { dispatched.push([key, payload]); return []; } };
  const external = { virtualmin: { accountSummary: async () => { throw new Error("should not be called when creds present"); } } };
  const service = new BillingService(billing, {}, {}, external, emails);

  const first = await service.notifyServiceActivated("svc-1");
  assert.equal(first.sent, true);
  assert.equal(dispatched.length, 1);
  const [key, payload] = dispatched[0];
  assert.equal(key, "hosting_account_information");
  assert.equal(payload.context.control_panel_url, "https://panel.dezhost.com:10000");
  assert.equal(payload.context.control_panel_username, "exampleadm");
  assert.equal(payload.context.control_panel_password, "Secret9!");
  assert.equal(payload.context.domain, "example.com");
  assert.match(payload.context.service_link, /\/client\/services\/svc-1$/);

  // Second call is a no-op: the activation email is sent only once.
  const second = await service.notifyServiceActivated("svc-1");
  assert.equal(second.sent, false);
  assert.equal(dispatched.length, 1);
});

test("notifyServiceActivated backfills the Virtualmin username from the panel when missing", async () => {
  const dispatched = [];
  const merges = [];
  const billing = {
    hasAuditLog: async () => false,
    serviceForEmail: async (id) => ({
      id,
      userId: "user-2",
      status: "ACTIVE",
      externalId: "shop.example.com",
      product: { type: "SHARED_HOSTING", name: "Hosting" },
      configuration: { domainName: "shop.example.com", hosting: { password: "Pw9!", controlPanelUrl: "https://panel:10000" } },
      domainRecords: [{ domain: "shop.example.com" }],
      user: { id: "user-2", email: "c2@example.com", name: "C Two" }
    }),
    createAuditLog: async () => {},
    mergeServiceConfiguration: async (id, patch) => merges.push([id, patch])
  };
  const emails = { dispatch: async (key, payload) => dispatched.push([key, payload]) };
  const external = { virtualmin: { accountSummary: async (domain) => ({ controlPanelUrl: "https://panel:10000", username: domain === "shop.example.com" ? "shopadm" : "" }) } };
  const service = new BillingService(billing, {}, {}, external, emails);

  const result = await service.notifyServiceActivated("svc-2");
  assert.equal(result.sent, true);
  assert.equal(merges.length, 1);
  assert.equal(merges[0][1].hosting.username, "shopadm");
  assert.equal(dispatched[0][1].context.control_panel_username, "shopadm");
  assert.equal(dispatched[0][1].context.control_panel_password, "Pw9!");
});

test("notifyDomainActivated sends domain email with name servers, status and a dashboard link", async () => {
  const dispatched = [];
  const audits = new Set();
  const billing = {
    hasAuditLog: async (action, id) => audits.has(`${action}:${id}`),
    domainForEmail: async (id) => ({
      id,
      userId: "user-3",
      domain: "mydomain.de",
      status: "ACTIVE",
      nameservers: ["ns1.dezhost.com", "ns2.dezhost.com"],
      user: { id: "user-3", email: "c3@example.com", name: "C Three" },
      service: { product: { name: "Domain registration" } }
    }),
    createAuditLog: async ({ action, subjectId }) => audits.add(`${action}:${subjectId}`)
  };
  const emails = { dispatch: async (key, payload) => dispatched.push([key, payload]) };
  const service = new BillingService(billing, {}, {}, undefined, emails);

  const result = await service.notifyDomainActivated("dom-1");
  assert.equal(result.sent, true);
  const [key, payload] = dispatched[0];
  assert.equal(key, "domain_information");
  assert.equal(payload.context.domain, "mydomain.de");
  assert.equal(payload.context.domain_status, "Active");
  assert.equal(payload.context.nameservers, "ns1.dezhost.com, ns2.dezhost.com");
  assert.match(payload.context.domain_link, /\/client\/domains$/);

  const second = await service.notifyDomainActivated("dom-1");
  assert.equal(second.sent, false);
});

test("notifyPendingActivations emails only the un-notified active accounts", async () => {
  const dispatched = [];
  const audits = new Set(["service.activation_email:svc-old"]);
  const billing = {
    activeHostingServiceIds: async () => ["svc-old", "svc-new"],
    activeDomainRecordIds: async () => ["dom-new"],
    notifiedSubjectIds: async (action) => new Set([...audits].filter((row) => row.startsWith(`${action}:`)).map((row) => row.split(":")[1])),
    hasAuditLog: async (action, id) => audits.has(`${action}:${id}`),
    serviceForEmail: async (id) => ({ id, userId: "u", status: "ACTIVE", product: { type: "SHARED_HOSTING", name: "H" }, configuration: { hosting: { controlPanelUrl: "u", username: "n", password: "p" } }, domainRecords: [{ domain: "d.com" }], user: { email: "e@e.com", name: "N" } }),
    domainForEmail: async (id) => ({ id, userId: "u", domain: "dom.com", status: "ACTIVE", nameservers: ["ns1"], user: { email: "e@e.com", name: "N" }, service: { product: { name: "D" } } }),
    createAuditLog: async ({ action, subjectId }) => audits.add(`${action}:${subjectId}`),
    mergeServiceConfiguration: async () => {}
  };
  const emails = { dispatch: async (key, payload) => dispatched.push([key, payload]) };
  const service = new BillingService(billing, {}, {}, { virtualmin: { accountSummary: async () => ({ controlPanelUrl: "u", username: "n" }) } }, emails);

  const result = await service.notifyPendingActivations();
  assert.equal(result.services, 1, "only the un-notified hosting service is emailed");
  assert.equal(result.domains, 1, "the newly active domain is emailed");
  assert.deepEqual(dispatched.map((entry) => entry[0]).sort(), ["domain_information", "hosting_account_information"]);
});
