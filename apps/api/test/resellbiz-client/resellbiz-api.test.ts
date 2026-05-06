import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ResellBizClient,
  buildResellBizRequest,
  credentialsFromEnv,
  parseCustomerDomainPrices,
  type ResellBizCredentials
} from "../../src/modules/resellbiz-client/resellbiz-api";

const credentials: ResellBizCredentials = {
  apiKey: "key",
  baseUrl: "https://httpapi.com/",
  resellerId: "1325587"
};

describe("Resell.biz API request helpers", () => {
  it("builds GET requests with auth and repeated array params", () => {
    const request = buildResellBizRequest(credentials, "GET", "/api/domains/details.json", {
      "order-id": 123,
      options: ["OrderDetails", "NsDetails"]
    });

    assert.equal(request.url.origin, "https://httpapi.com");
    assert.equal(request.url.pathname, "/api/domains/details.json");
    assert.equal(request.url.searchParams.get("auth-userid"), "1325587");
    assert.equal(request.url.searchParams.get("api-key"), "key");
    assert.deepEqual(request.url.searchParams.getAll("options"), ["OrderDetails", "NsDetails"]);
    assert.equal(request.body, undefined);
  });

  it("builds POST requests with form bodies", () => {
    const request = buildResellBizRequest(credentials, "POST", "api/domains/modify-ns.json", {
      ns: ["ns1.example.com", "ns2.example.com"],
      "order-id": 123
    });

    assert.equal(request.url.toString(), "https://httpapi.com/api/domains/modify-ns.json");
    assert.equal(request.body?.get("auth-userid"), "1325587");
    assert.deepEqual(request.body?.getAll("ns"), ["ns1.example.com", "ns2.example.com"]);
  });

  it("reads api key credentials from env and supports temporary password fallback", () => {
    assert.deepEqual(
      credentialsFromEnv({
        RESELLBIZ_PASSWORD: "temporary-password",
        RESELLBIZ_RESELLER_ID: "1325587"
      }),
      {
        apiKey: "temporary-password",
        baseUrl: undefined,
        resellerId: "1325587"
      }
    );
  });
});

describe("Resell.biz client", () => {
  it("gets domain status and expiry by resolving order id first", async () => {
    const calls: string[] = [];
    const client = new ResellBizClient(credentials, async (url) => {
      const requestUrl = String(url);
      calls.push(requestUrl);

      if (requestUrl.includes("/api/domains/orderid.json")) {
        return jsonResponse(987654);
      }

      return jsonResponse({
        currentstatus: "Active",
        domainname: "example.com",
        domsecret: "transfer-secret",
        endtime: "1893456000",
        ns1: "ns1.example.com",
        ns2: "ns2.example.com",
        orderstatus: ["transferlock"]
      });
    });

    const details = await client.getDomainSummary("example.com");

    assert.equal(details.orderId, 987654);
    assert.equal(details.domainName, "example.com");
    assert.equal(details.currentStatus, "Active");
    assert.equal(details.expiresAt, "2030-01-01T00:00:00.000Z");
    assert.deepEqual(details.nameServers, ["ns1.example.com", "ns2.example.com"]);
    assert.equal(details.transferCode, "transfer-secret");
    assert.equal(calls.length, 2);
  });

  it("changes name servers using the resolved order id", async () => {
    const bodies: URLSearchParams[] = [];
    const client = new ResellBizClient(credentials, async (url, init) => {
      if (String(url).includes("/api/domains/orderid.json")) {
        return jsonResponse(123);
      }

      bodies.push(new URLSearchParams(String(init?.body)));
      return jsonResponse({ actionstatus: "Success", entityid: 123 });
    });

    await client.changeNameServers({ domainName: "example.com" }, ["ns1.new.test", "ns2.new.test"]);

    assert.equal(bodies[0]?.get("order-id"), "123");
    assert.deepEqual(bodies[0]?.getAll("ns"), ["ns1.new.test", "ns2.new.test"]);
  });

  it("submits transfer requests with contacts, nameservers, auth code, and attributes", async () => {
    let body: URLSearchParams | undefined;
    const client = new ResellBizClient(credentials, async (_url, init) => {
      body = new URLSearchParams(String(init?.body));
      return jsonResponse({ actionstatus: "Success", entityid: 123 });
    });

    await client.transferDomain({
      adminContactId: 12,
      authCode: "domain-secret",
      autoRenew: false,
      billingContactId: 14,
      customerId: 55,
      domainName: "example.com",
      extraAttributes: { tnc: "y" },
      invoiceOption: "KeepInvoice",
      nameServers: ["ns1.example.com", "ns2.example.com"],
      registrantContactId: 11,
      technicalContactId: 13
    });

    assert.equal(body?.get("domain-name"), "example.com");
    assert.equal(body?.get("auth-code"), "domain-secret");
    assert.equal(body?.get("customer-id"), "55");
    assert.equal(body?.get("auto-renew"), "false");
    assert.deepEqual(body?.getAll("ns"), ["ns1.example.com", "ns2.example.com"]);
    assert.equal(body?.get("attr-name1"), "tnc");
    assert.equal(body?.get("attr-value1"), "y");
  });

  it("submits test API domain registration requests with contacts and no external invoice", async () => {
    let body: URLSearchParams | undefined;
    let path = "";
    const client = new ResellBizClient({ ...credentials, baseUrl: "https://test.httpapi.com" }, async (url, init) => {
      path = url.pathname;
      body = new URLSearchParams(String(init?.body));
      return jsonResponse({ actionstatus: "Success", entityid: 123 });
    });

    await client.registerDomain({
      adminContactId: 12,
      autoRenew: true,
      billingContactId: 14,
      customerId: 55,
      domainName: "new-example.com",
      extraAttributes: { tnc: "Y" },
      invoiceOption: "NoInvoice",
      nameServers: ["ns1.dezhost.test", "ns2.dezhost.test"],
      protectPrivacy: false,
      purchasePrivacy: false,
      registrantContactId: 11,
      technicalContactId: 13,
      years: 1
    });

    assert.equal(path, "/api/domains/register.json");
    assert.equal(body?.get("domain-name"), "new-example.com");
    assert.equal(body?.get("years"), "1");
    assert.equal(body?.get("customer-id"), "55");
    assert.equal(body?.get("reg-contact-id"), "11");
    assert.equal(body?.get("admin-contact-id"), "12");
    assert.equal(body?.get("tech-contact-id"), "13");
    assert.equal(body?.get("billing-contact-id"), "14");
    assert.equal(body?.get("invoice-option"), "NoInvoice");
    assert.equal(body?.get("auto-renew"), "true");
    assert.deepEqual(body?.getAll("ns"), ["ns1.dezhost.test", "ns2.dezhost.test"]);
    assert.equal(body?.get("attr-name1"), "tnc");
    assert.equal(body?.get("attr-value1"), "Y");
  });

  it("submits domain renewal requests with order id, expiry, and years", async () => {
    let body: URLSearchParams | undefined;
    let path = "";
    const client = new ResellBizClient(credentials, async (url, init) => {
      path = url.pathname;
      body = new URLSearchParams(String(init?.body));
      return jsonResponse({ actionstatus: "Success", entityid: 123 });
    });

    await client.renewDomain({
      autoRenew: true,
      discountAmount: 0,
      expDate: 1893456000,
      extraAttributes: { premium: true },
      invoiceOption: "NoInvoice",
      orderId: 123,
      purchasePremiumDns: false,
      purchasePrivacy: false,
      years: 1
    });

    assert.equal(path, "/api/domains/renew.json");
    assert.equal(body?.get("order-id"), "123");
    assert.equal(body?.get("exp-date"), "1893456000");
    assert.equal(body?.get("years"), "1");
    assert.equal(body?.get("invoice-option"), "NoInvoice");
    assert.equal(body?.get("auto-renew"), "true");
    assert.equal(body?.get("discount-amount"), "0");
    assert.equal(body?.get("attr-name1"), "premium");
    assert.equal(body?.get("attr-value1"), "true");
  });

  it("fetches and normalizes customer domain prices", async () => {
    const client = new ResellBizClient(credentials, async (url) => {
      assert.equal(url.pathname, "/api/products/customer-price.json");
      assert.equal(url.searchParams.get("customer-id"), "55");
      return jsonResponse({
        dotcom: {
          addnewdomain: { "1": "10.50", "2": "20.00", "3": "29.99" },
          addtransferdomain: { "1": "9.50" },
          renewdomain: { "1": "11.50", "3": "31.00" }
        },
        hosting: { "0": { add: { "12": 1 } } }
      });
    });

    const prices = await client.getCustomerDomainPrices(55);

    assert.deepEqual(prices, [
      { action: "register", amountCents: 1050, tld: "com", years: 1 },
      { action: "register", amountCents: 2000, tld: "com", years: 2 },
      { action: "register", amountCents: 2999, tld: "com", years: 3 },
      { action: "transfer", amountCents: 950, tld: "com", years: 1 },
      { action: "renew", amountCents: 1150, tld: "com", years: 1 },
      { action: "renew", amountCents: 3100, tld: "com", years: 3 }
    ]);
  });

  it("creates customers and contacts before domain provisioning", async () => {
    const bodies: URLSearchParams[] = [];
    const paths: string[] = [];
    const client = new ResellBizClient(credentials, async (url, init) => {
      paths.push(url.pathname);
      bodies.push(new URLSearchParams(String(init?.body)));
      return jsonResponse(url.pathname.includes("/customers/") ? 55 : 66);
    });

    const customerId = await client.addCustomer({
      addressLine1: "Main 1",
      city: "Berlin",
      company: "Buyer GmbH",
      country: "DE",
      email: "buyer@example.com",
      name: "Buyer Person",
      password: "Strong!123",
      phone: "30123456",
      phoneCountryCode: "49",
      state: "Berlin",
      vatId: "DE123",
      zipCode: "10115"
    });
    const contactId = await client.addContact({
      addressLine1: "Main 1",
      city: "Berlin",
      company: "Buyer GmbH",
      country: "DE",
      customerId,
      email: "buyer@example.com",
      name: "Buyer Person",
      phone: "30123456",
      phoneCountryCode: "49",
      state: "Berlin",
      zipCode: "10115"
    });

    assert.equal(customerId, 55);
    assert.equal(contactId, 66);
    assert.deepEqual(paths, ["/api/customers/signup.json", "/api/contacts/add.json"]);
    assert.equal(bodies[0]?.get("username"), "buyer@example.com");
    assert.equal(bodies[0]?.get("passwd"), "Strong!123");
    assert.equal(bodies[1]?.get("customer-id"), "55");
    assert.equal(bodies[1]?.get("type"), "Contact");
  });

  it("ignores non-domain product pricing while parsing customer prices", () => {
    assert.deepEqual(
      parseCustomerDomainPrices({
        com: { addnewdomain: { "1": "12.00" } },
        domcno: { renewdomain: { "1": "12.82" } },
        dotde: { renewdomain: { "1": 7.25 } },
        dedicatedserverlinuxus: { plans: { "1": { renew: { "12": 20 } } } }
      }),
      [
        { action: "register", amountCents: 1200, tld: "com", years: 1 },
        { action: "renew", amountCents: 1282, tld: "com", years: 1 },
        { action: "renew", amountCents: 725, tld: "de", years: 1 }
      ]
    );
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}
