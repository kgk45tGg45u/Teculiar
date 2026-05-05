import type {
  FetchLike,
  ParamValue,
  ResellBizCredentials,
  ResellBizMethod,
  ResellBizRequest
} from "./resellbiz-types";

const DEFAULT_BASE_URL = "https://httpapi.com";
const DEFAULT_HEADERS = {
  Accept: "application/json, text/plain",
  "User-Agent": "DezhostAdminResellBizClient/0.1 (+https://dezhost.com)"
};

export class ResellBizApiError extends Error {
  constructor(
    message: string,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = "ResellBizApiError";
  }
}

export function credentialsFromEnv(env: Record<string, string | undefined> = process.env): ResellBizCredentials {
  const resellerId = cleanEnv(env.RESELLBIZ_RESELLER_ID ?? env.RESELLBIZ_AUTH_USERID);
  const apiKey = cleanEnv(env.RESELLBIZ_API_KEY ?? env.RESELLBIZ_PASSWORD);

  if (!resellerId) {
    throw new Error("Missing RESELLBIZ_RESELLER_ID.");
  }

  if (!apiKey) {
    throw new Error("Missing RESELLBIZ_API_KEY. RESELLBIZ_PASSWORD can be used only for temporary testing.");
  }

  return {
    apiKey,
    baseUrl: cleanEnv(env.RESELLBIZ_API_BASE_URL),
    resellerId
  };
}

export function resolveResellBizBaseUrl(input = DEFAULT_BASE_URL): string {
  const trimmed = input.trim() || DEFAULT_BASE_URL;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";

  return url.toString().replace(/\/$/, "");
}

export function buildResellBizRequest(
  credentials: ResellBizCredentials,
  method: ResellBizMethod,
  path: string,
  params: Record<string, ParamValue> = {}
): ResellBizRequest {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${resolveResellBizBaseUrl(credentials.baseUrl)}/`);
  const body = new URLSearchParams();
  appendParam(body, "auth-userid", credentials.resellerId);
  appendParam(body, "api-key", credentials.apiKey);

  for (const [key, value] of Object.entries(params)) {
    appendParam(body, key, value);
  }

  if (method === "GET") {
    url.search = body.toString();
    return { body: undefined, headers: DEFAULT_HEADERS, method, url };
  }

  return {
    body,
    headers: {
      ...DEFAULT_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method,
    url
  };
}

export async function callResellBiz<T = unknown>(
  credentials: ResellBizCredentials,
  method: ResellBizMethod,
  path: string,
  params: Record<string, ParamValue> = {},
  fetcher: FetchLike = globalThis.fetch
): Promise<T> {
  const request = buildResellBizRequest(credentials, method, path, params);
  const response = await fetcher(request.url, {
    body: request.body,
    headers: request.headers,
    method: request.method
  });
  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw new ResellBizApiError(httpErrorMessage(response.status, text), payload);
  }

  if (isRecord(payload) && String(payload.status ?? "").toUpperCase() === "ERROR") {
    throw new ResellBizApiError(`Resell.biz API error: ${errorMessage(payload)}`, payload);
  }

  return payload as T;
}

function appendParam(params: URLSearchParams, key: string, value: ParamValue): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      params.append(key, String(item));
    }
    return;
  }

  params.append(key, String(value));
}

function parsePayload(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function errorMessage(payload: Record<string, unknown>): string {
  const message = payload.message ?? payload.error ?? payload.description ?? payload.messagekey;
  return typeof message === "string" ? message : "Unknown error";
}

function httpErrorMessage(status: number, text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (/<!doctype html|<html/i.test(compact)) {
    return `Resell.biz HTTP ${status}: got an HTML error page instead of API JSON. Check API base URL and whitelisted public IP.`;
  }

  return `Resell.biz HTTP ${status}: ${compact.slice(0, 300)}`;
}

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
