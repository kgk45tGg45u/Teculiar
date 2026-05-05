import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  entriesFromVirtualmin,
  normalizeMailboxUser,
  parseVirtualminText,
  quotaBlocksFromMb
} from "../../src/modules/virtualmin-client/virtualmin-normalize";

describe("Virtualmin normalizers", () => {
  it("parses indented multiline output into entries", () => {
    const entries = parseVirtualminText(`example.com
    User: example
    IP address: 203.0.113.10
mail.example.com
    User: mail`);

    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.name, "example.com");
    assert.equal(entries[0]?.fields["User"], "example");
    assert.equal(entries[0]?.fields["IP address"], "203.0.113.10");
  });

  it("converts mailbox usernames and quota values safely", () => {
    assert.equal(normalizeMailboxUser("sales@example.com", "example.com"), "sales");
    assert.equal(normalizeMailboxUser("support", "example.com"), "support");
    assert.equal(quotaBlocksFromMb("25"), "25600");
    assert.equal(quotaBlocksFromMb(""), undefined);
  });

  it("parses JSON-wrapped command text", () => {
    const entries = entriesFromVirtualmin(
      { status: "success", output: "example.com\n    User: example" },
      ""
    );

    assert.equal(entries[0]?.name, "example.com");
    assert.equal(entries[0]?.fields.User, "example");
  });
});
