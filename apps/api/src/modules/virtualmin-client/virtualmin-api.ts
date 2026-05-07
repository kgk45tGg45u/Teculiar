import http from "node:http";
import https from "node:https";
import { Buffer } from "node:buffer";
import { entriesFromVirtualmin } from "./virtualmin-normalize";
import type { VirtualminCommandResult, VirtualminCredentials } from "./virtualmin-types";

type ParamValue = boolean | number | string | undefined;

export const VIRTUALMIN_REQUEST_TIMEOUT_MS = 180_000;

export function resolveVirtualminEndpoint(input: string): string {
  const withProtocol = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const url = new URL(withProtocol);

  if (!url.port) {
    url.port = "10000";
  }

  if (url.pathname === "/") {
    url.pathname = "/virtual-server/remote.cgi";
  }

  url.hash = "";
  url.search = "";

  return url.toString();
}

export function buildVirtualminRequest(
  credentials: VirtualminCredentials,
  program: string,
  params: Record<string, ParamValue> = {}
) {
  const body = new URLSearchParams({ json: "1", program });

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) {
      continue;
    }

    body.set(key, value === true ? "" : String(value));
  }

  return {
    allowSelfSigned: credentials.allowSelfSigned === true,
    body,
    headers: {
      Accept: "application/json, text/plain",
      Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    url: new URL(resolveVirtualminEndpoint(credentials.endpoint))
  };
}

export async function callVirtualmin(
  credentials: VirtualminCredentials,
  program: string,
  params: Record<string, ParamValue> = {}
): Promise<VirtualminCommandResult> {
  const request = buildVirtualminRequest(credentials, program, params);
  const text = await postForm(request);
  const json = parseJson(text);
  const ok = isSuccess(json, text);

  return {
    entries: entriesFromVirtualmin(json, text),
    json,
    message: messageFrom(json, text),
    ok,
    program,
    text
  };
}

async function postForm(request: ReturnType<typeof buildVirtualminRequest>): Promise<string> {
  const payload = request.body.toString();
  const client = request.url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        headers: { ...request.headers, "Content-Length": Buffer.byteLength(payload) },
        hostname: request.url.hostname,
        method: "POST",
        path: `${request.url.pathname}${request.url.search}`,
        port: request.url.port,
        protocol: request.url.protocol,
        rejectUnauthorized: !request.allowSelfSigned
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Virtualmin HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }

          resolve(body);
        });
      }
    );

    req.setTimeout(VIRTUALMIN_REQUEST_TIMEOUT_MS, () => req.destroy(new Error("Virtualmin request timed out")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isSuccess(json: unknown, text: string): boolean {
  if (isRecord(json)) {
    const status = String(json.status ?? json.success ?? "").toLowerCase();
    if (["success", "true", "1"].includes(status)) {
      return true;
    }

    if (["error", "failure", "failed", "false", "0"].includes(status)) {
      return false;
    }
  }

  return !/Exit status:\s*[1-9]/i.test(text);
}

function messageFrom(json: unknown, text: string): string | undefined {
  if (isRecord(json)) {
    const message = json.message ?? json.error;
    return typeof message === "string" ? message : undefined;
  }

  const match = text.match(/(?:Error|Failed):\s*(.+)/i);
  return match?.[1]?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
