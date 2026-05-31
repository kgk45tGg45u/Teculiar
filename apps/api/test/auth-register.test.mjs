import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthService } from "../dist/modules/auth/auth.service.js";

test("auth register stores storefront signup profile fields", async () => {
  const created = [];
  const sessions = [];
  const audits = [];
  const emails = [];
  const users = {
    findByEmail: async () => null,
    createClient: async (input) => {
      created.push(input);
      return { email: input.email, id: "user-1", name: input.name };
    },
    createAuditLog: async (input) => {
      audits.push(input);
    },
    createRefreshSession: async (input) => {
      sessions.push(input);
    }
  };
  const email = {
    dispatch: async (eventKey, payload) => {
      emails.push([eventKey, payload]);
    }
  };
  const auth = new AuthService({ signAsync: async () => "jwt" }, users, email);

  const result = await auth.register({
    address: { city: "Berlin", line1: "Musterstrasse 1", postalCode: "12345" },
    companyName: "Example GmbH",
    countryCode: "DE",
    customerType: "BUSINESS",
    email: " CLIENT@Example.Test ",
    name: "Client User",
    password: "Valid1@Passw",
    phone: "+49 30 123",
    vatId: "DE123456789"
  }, "127.0.0.1");

  assert.equal(result.accessToken, "jwt");
  assert.equal(result.user.email, "client@example.test");
  assert.equal(created.length, 1);
  assert.equal(created[0].email, "client@example.test");
  assert.equal(created[0].customerType, "BUSINESS");
  assert.equal(created[0].countryCode, "DE");
  assert.equal(created[0].phone, "+49 30 123");
  assert.equal(created[0].vatId, "DE123456789");
  assert.deepEqual(created[0].address, { city: "Berlin", line1: "Musterstrasse 1", postalCode: "12345" });
  assert.equal(sessions.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(emails.length, 1);
});
