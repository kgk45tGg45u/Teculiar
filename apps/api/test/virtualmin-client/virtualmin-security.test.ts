import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminCredentialsFromEnv,
  assertSafeDomain,
  forceActionDomain,
  isDomainOwnedByUser
} from "../../src/modules/virtualmin-client/virtualmin-security";

describe("Virtualmin security helpers", () => {
  it("loads admin credentials from env without trusting the form password", () => {
    const admin = adminCredentialsFromEnv(
      {
        VIRTUALMIN_ADMIN_ENDPOINT: "https://panel.example.com:10000",
        VIRTUALMIN_ADMIN_USERNAME: "api-admin",
        VIRTUALMIN_ADMIN_PASSWORD: "admin-secret",
        VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED: "1"
      },
      { endpoint: "https://attacker.example:10000", username: "user", password: "user-secret" }
    );

    assert.deepEqual(admin, {
      allowSelfSigned: true,
      endpoint: "https://panel.example.com:10000",
      username: "api-admin",
      password: "admin-secret"
    });
  });

  it("forces admin actions back onto the validated domain", () => {
    assert.deepEqual(
      forceActionDomain(
        {
          params: { domain: "evil.example", user: "sales" },
          program: "delete-user"
        },
        "example.com"
      ),
      {
        params: { domain: "example.com", user: "sales" },
        program: "delete-user"
      }
    );
  });

  it("checks owner-filtered list-domains results", () => {
    assert.equal(
      isDomainOwnedByUser(
        {
          entries: [{ name: "example.com", fields: {} }],
          ok: true,
          program: "list-domains",
          text: ""
        },
        "example.com"
      ),
      true
    );
  });

  it("rejects unsafe domain names", () => {
    assert.throws(() => assertSafeDomain("example.com; rm -rf /"), /Invalid domain/);
  });
});
