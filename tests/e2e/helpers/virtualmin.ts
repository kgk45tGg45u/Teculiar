/**
 * Virtualmin teardown — deletes hosting accounts the suite created on the real
 * panel. Talks directly to remote.cgi the same way apps/api's virtualmin-api.ts
 * does, so cleanup works even if the platform never exposed a delete endpoint.
 *
 * Only ever called for domains the suite itself provisioned (see teardown-registry).
 */
import http from "node:http";
import https from "node:https";
import { Buffer } from "node:buffer";
import { env } from "../config/env";

export type VirtualminDeleteResult = { domain: string; ok: boolean; message: string; skipped?: boolean };

function resolveEndpoint(input: string): URL {
  const withProtocol = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const url = new URL(withProtocol);
  if (!url.port) url.port = "10000";
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/virtual-server/remote.cgi";
  url.hash = "";
  url.search = "";
  return url;
}

function call(program: string, params: Record<string, string>): Promise<{ ok: boolean; message: string }> {
  const { endpoint, username, password, allowSelfSigned } = env.virtualmin;
  const url = resolveEndpoint(endpoint);
  const body = new URLSearchParams({ json: "1", program, ...params }).toString();
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve) => {
    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        protocol: url.protocol,
        rejectUnauthorized: !allowSelfSigned,
        headers: {
          Accept: "application/json, text/plain",
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let status = "";
          try {
            status = String((JSON.parse(text) as { status?: string }).status ?? "").toLowerCase();
          } catch {
            /* non-JSON response */
          }
          const ok = status === "success" || (!status && !/Exit status:\s*[1-9]/i.test(text) && (res.statusCode ?? 0) < 400);
          resolve({ ok, message: text.slice(0, 200) });
        });
      }
    );
    req.setTimeout(60_000, () => req.destroy(new Error("Virtualmin delete timed out")));
    req.on("error", (e) => resolve({ ok: false, message: e.message }));
    req.write(body);
    req.end();
  });
}

/** Delete a single Virtualmin virtual server by domain. Idempotent and never throws. */
export async function deleteVirtualminDomain(domain: string): Promise<VirtualminDeleteResult> {
  if (!env.virtualmin.endpoint || !env.virtualmin.username) {
    return { domain, ok: false, skipped: true, message: "Virtualmin admin credentials not configured" };
  }
  const result = await call("delete-domain", { domain });
  // "does not exist" responses count as success — the account is gone either way.
  const gone = result.ok || /does not exist|no such|not found/i.test(result.message);
  return { domain, ok: gone, message: result.message };
}

/** Delete many domains, tolerating individual failures. */
export async function deleteVirtualminDomains(domains: string[]): Promise<VirtualminDeleteResult[]> {
  const results: VirtualminDeleteResult[] = [];
  for (const domain of [...new Set(domains)]) {
    results.push(await deleteVirtualminDomain(domain));
  }
  return results;
}
