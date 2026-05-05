import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderVirtualminPage } from "../../src/modules/virtualmin-client/virtualmin-page";

describe("Virtualmin HTML page", () => {
  it("escapes dynamic content and shows webmail link", () => {
    const html = renderVirtualminPage({
      form: { domain: "example.com", endpoint: "https://panel.example.com:10000", username: "root" },
      report: {
        bandwidth: [],
        databases: [{ name: "safe", fields: { Type: "mysql" } }],
        domain: "example.com",
        domainFields: { Owner: "<script>" },
        errors: [],
        mailboxes: [{ name: "sales", fields: { Email: "sales@example.com" } }],
        webmailUrl: "https://webmail.example.com"
      }
    });

    assert.match(html, /https:\/\/webmail\.example\.com/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /name="password" value=/);
    assert.match(html, /Change email password/);
    assert.match(html, /Change database password/);
  });
});
