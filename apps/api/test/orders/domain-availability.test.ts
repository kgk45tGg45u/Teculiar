import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DomainAvailabilityService } from "../../src/modules/orders/domain-availability.service";

describe("DomainAvailabilityService", () => {
  it("uses IANA RDAP bootstrap and treats 404 as available", async () => {
    const urls: string[] = [];
    const service = new DomainAvailabilityService(async (url) => {
      urls.push(String(url));
      if (String(url).includes("data.iana.org")) {
        return jsonResponse({ services: [[["com"], ["https://rdap.example/"]]] });
      }

      return new Response("not found", { status: 404 });
    });

    const result = await service.check("new-example.com");

    assert.equal(result.available, true);
    assert.equal(result.source, "rdap");
    assert.equal(result.tld, "com");
    assert.equal(urls[1], "https://rdap.example/domain/new-example.com");
  });

  it("treats successful RDAP domain lookup as unavailable", async () => {
    const service = new DomainAvailabilityService(async (url) => {
      if (String(url).includes("data.iana.org")) {
        return jsonResponse({ services: [[["de"], ["https://rdap.example/"]]] });
      }

      return jsonResponse({ objectClassName: "domain" });
    });

    const result = await service.check("taken.de");

    assert.equal(result.available, false);
  });

  it("uses DENIC RDAP directly for .de domains", async () => {
    const urls: string[] = [];
    const service = new DomainAvailabilityService(async (url) => {
      urls.push(String(url));
      return new Response("not found", { status: 404 });
    });

    await service.check("frei.de");

    assert.equal(urls[0], "https://rdap.denic.de/domain/frei.de");
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
}
