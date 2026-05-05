import type { VirtualminEntry, VirtualminFields } from "./virtualmin-types";

export function parseVirtualminText(text: string): VirtualminEntry[] {
  const entries: VirtualminEntry[] = [];
  let current: VirtualminEntry | undefined;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^Exit status:/i.test(line.trim())) {
      continue;
    }

    const keyValue = splitKeyValue(line.trim());
    const startsEntry = !/^\s/.test(line) && (!keyValue || current === undefined);

    if (startsEntry) {
      current = { name: line.trim(), fields: {} };
      entries.push(current);
      continue;
    }

    if (!current) {
      current = { name: keyValue?.value ?? line.trim(), fields: {} };
      entries.push(current);
    }

    if (keyValue) {
      current.fields[keyValue.key] = keyValue.value;
    }
  }

  return entries;
}

export function entriesFromVirtualmin(json: unknown, text: string): VirtualminEntry[] {
  const outputText = outputTextFromJson(json);
  if (outputText) {
    return parseVirtualminText(outputText);
  }

  const jsonEntries = entriesFromUnknown(unwrapData(json));
  return jsonEntries.length > 0 ? jsonEntries : parseVirtualminText(text);
}

export function normalizeMailboxUser(user: string, domain: string): string {
  const cleanUser = user.trim();
  const suffix = `@${domain.toLowerCase()}`;

  if (cleanUser.toLowerCase().endsWith(suffix)) {
    return cleanUser.slice(0, cleanUser.length - suffix.length);
  }

  return cleanUser;
}

export function quotaBlocksFromMb(value: string): string | undefined {
  const quota = Number(value);

  if (!Number.isFinite(quota) || quota <= 0) {
    return undefined;
  }

  return String(Math.round(quota * 1024));
}

export function pickField(fields: VirtualminFields, names: string[]): string | undefined {
  const lower = new Map(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]));
  return names.map((name) => lower.get(name.toLowerCase())).find((value): value is string => Boolean(value));
}

function entriesFromUnknown(value: unknown): VirtualminEntry[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => entryFromUnknown(item, String(index + 1)));
  }

  if (!isRecord(value)) {
    return [];
  }

  const collection = firstCollection(value);
  if (collection) {
    return collection.map((item, index) => entryFromUnknown(item, String(index + 1)));
  }

  const nested = Object.entries(value).filter(([, item]) => isRecord(item));
  if (nested.length > 0) {
    return nested.map(([name, item]) => entryFromUnknown(item, name));
  }

  return [entryFromUnknown(value, "Result")];
}

function entryFromUnknown(value: unknown, fallbackName: string): VirtualminEntry {
  if (!isRecord(value)) {
    return { name: String(value || fallbackName), fields: {} };
  }

  const fields = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringifyField(item)]));
  const name = fields.Domain ?? fields.domain ?? fields.Name ?? fields.name ?? fallbackName;

  return { name, fields };
}

function firstCollection(record: Record<string, unknown>): unknown[] | undefined {
  for (const key of ["domains", "users", "databases", "bandwidth", "data"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function splitKeyValue(line: string): { key: string; value: string } | undefined {
  const index = line.indexOf(":");
  if (index < 1) {
    return undefined;
  }

  return {
    key: line.slice(0, index).trim(),
    value: line.slice(index + 1).trim()
  };
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && "data" in value) {
    return value.data;
  }

  return value;
}

function outputTextFromJson(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const output = value.output ?? value.data;
  return typeof output === "string" ? output : undefined;
}

function stringifyField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
