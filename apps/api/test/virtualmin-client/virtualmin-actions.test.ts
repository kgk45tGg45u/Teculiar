import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionFromBody } from "../../src/modules/virtualmin-client/virtualmin-actions";

describe("Virtualmin actions", () => {
  it("maps mailbox creation to create-user params", () => {
    assert.deepEqual(
      actionFromBody({
        domain: "example.com",
        intent: "add-email",
        mailPassword: "secret",
        mailQuotaMb: "5",
        mailUser: "sales@example.com"
      }),
      {
        params: {
          domain: "example.com",
          pass: "secret",
          quota: "5120",
          user: "sales"
        },
        program: "create-user"
      }
    );
  });

  it("maps database deletion to delete-database params", () => {
    assert.deepEqual(
      actionFromBody({
        databaseName: "example_wp",
        databaseType: "mysql",
        domain: "example.com",
        intent: "remove-database"
      }),
      {
        params: { domain: "example.com", name: "example_wp", type: "mysql" },
        program: "delete-database"
      }
    );
  });

  it("maps mailbox password changes to modify-user", () => {
    assert.deepEqual(
      actionFromBody({
        domain: "example.com",
        intent: "change-email-password",
        mailPassword: "new-secret",
        mailUser: "sales@example.com"
      }),
      {
        params: {
          domain: "example.com",
          pass: "new-secret",
          user: "sales"
        },
        program: "modify-user"
      }
    );
  });

  it("maps database password changes to modify-database-pass", () => {
    assert.deepEqual(
      actionFromBody({
        databasePassword: "new-secret",
        databaseType: "mysql",
        domain: "example.com",
        intent: "change-database-password"
      }),
      {
        params: { domain: "example.com", pass: "new-secret", type: "mysql" },
        program: "modify-database-pass"
      }
    );
  });
});
