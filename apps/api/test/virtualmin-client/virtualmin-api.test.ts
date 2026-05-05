import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVirtualminRequest, resolveVirtualminEndpoint } from "../../src/modules/virtualmin-client/virtualmin-api";

describe("Virtualmin API request helpers", () => {
  it("normalizes a host into the remote CGI endpoint", () => {
    assert.equal(
      resolveVirtualminEndpoint("panel.example.com"),
      "https://panel.example.com:10000/virtual-server/remote.cgi"
    );
  });

  it("builds POST requests with auth, program fields, and bare flags", () => {
    const request = buildVirtualminRequest(
      {
        endpoint: "https://panel.example.com:10000",
        username: "root",
        password: "secret",
        allowSelfSigned: true
      },
      "list-domains",
      { domain: "example.com", multiline: true }
    );

    assert.equal(request.url.hostname, "panel.example.com");
    assert.equal(request.url.pathname, "/virtual-server/remote.cgi");
    assert.equal(request.body.get("json"), "1");
    assert.equal(request.body.get("program"), "list-domains");
    assert.equal(request.body.get("domain"), "example.com");
    assert.equal(request.body.get("multiline"), "");
    assert.equal(request.headers.Authorization, "Basic cm9vdDpzZWNyZXQ=");
  });

  it("omits false flags", () => {
    const request = buildVirtualminRequest(
      {
        endpoint: "panel.example.com",
        username: "root",
        password: "secret"
      },
      "list-domains",
      { multiline: false }
    );

    assert.equal(request.body.has("multiline"), false);
  });
});
