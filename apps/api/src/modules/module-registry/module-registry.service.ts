import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_NAME_SERVERS,
  MODULE_CATALOG,
  ModuleDefinition,
  ModuleField,
  ModuleKind,
  RESELLBIZ_LIVE_BASE_URL,
  RESELLBIZ_TEST_BASE_URL,
  canonicalModuleName,
  moduleDefinition
} from "./module-catalog";

const SECRET_MASK = "********";

export interface ModuleSummary {
  name: string;
  kind: ModuleKind;
  label: string;
  description: string;
  active: boolean;
  config: Record<string, unknown>;
  fields: ModuleField[];
}

export interface ResellbizConfig {
  active: boolean;
  apiKey: string;
  resellerId: string;
  mode: "test" | "live";
  baseUrl: string;
  defaultNs: string[];
}

export interface VirtualminConfig {
  active: boolean;
  endpoint: string;
  username: string;
  password: string;
  allowSelfSigned: boolean;
  jobDelayMinutes: number;
}

// Central registry for the pluggable integration modules. Owns: the enabled-state and config of each
// module (DB-backed, .env fallback), plus the generic "is this kind active?" queries the cron and
// provisioning lifecycle rely on so they stay provider-agnostic.
@Injectable()
export class ModuleRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  private settingKey(name: string, field: string) {
    return `module.${name}.${field}`;
  }

  // Load every `module.*` setting in one query and index by key for cheap repeated lookups.
  private async loadSettings(): Promise<Map<string, unknown>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { startsWith: "module." } } });
    return new Map(rows.map((row) => [row.key, row.value]));
  }

  private rawValue(settings: Map<string, unknown>, name: string, field: string): unknown {
    return settings.get(this.settingKey(name, field));
  }

  // Resolve a field's effective string value: DB value first, then the configured env fallbacks.
  private resolveString(settings: Map<string, unknown>, name: string, fieldDef: ModuleField): string {
    const stored = this.rawValue(settings, name, fieldDef.key);
    if (typeof stored === "string" && stored.trim() !== "") {
      return stored;
    }
    if (typeof stored === "number") {
      return String(stored);
    }
    for (const envKey of fieldDef.envFallback ?? []) {
      const envValue = process.env[envKey];
      if (typeof envValue === "string" && envValue.trim() !== "") {
        return envValue.trim();
      }
    }
    return "";
  }

  private isActive(settings: Map<string, unknown>, name: string): boolean {
    const value = this.rawValue(settings, name, "active");
    // Modules default to active so a fresh install still provisions; admin can disable explicitly.
    return value === undefined ? true : value !== 0;
  }

  // The admin-facing list. Secrets are masked so we never echo credentials back to the browser.
  async list(): Promise<ModuleSummary[]> {
    const settings = await this.loadSettings();
    return MODULE_CATALOG.map((module) => ({
      name: module.name,
      kind: module.kind,
      label: module.label,
      description: module.description,
      active: this.isActive(settings, module.name),
      fields: module.fields,
      config: this.summaryConfig(settings, module)
    }));
  }

  private summaryConfig(settings: Map<string, unknown>, module: ModuleDefinition): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    for (const field of module.fields) {
      if (field.type === "secret") {
        // Report only whether a secret is set, never its value.
        config[field.key] = this.resolveString(settings, module.name, field) ? SECRET_MASK : "";
      } else if (field.type === "boolean") {
        const stored = this.rawValue(settings, module.name, field.key);
        config[field.key] = stored === undefined
          ? this.resolveString(settings, module.name, field) === "1" || this.resolveString(settings, module.name, field).toLowerCase() === "true"
          : stored === 1 || stored === true;
      } else {
        config[field.key] = this.resolveString(settings, module.name, field);
      }
    }
    return config;
  }

  // Persist active-state and/or config for a module. Unknown fields and masked secrets are ignored.
  async update(name: string, input: { active?: boolean; config?: Record<string, unknown> }): Promise<ModuleSummary[]> {
    const module = moduleDefinition(name);
    if (!module) {
      throw new Error(`Unknown module: ${name}`);
    }
    const ops: Promise<unknown>[] = [];
    if (input.active !== undefined) {
      ops.push(this.upsertNumber(this.settingKey(name, "active"), input.active ? 1 : 0));
    }
    if (input.config) {
      for (const field of module.fields) {
        if (!(field.key in input.config)) {
          continue;
        }
        const value = input.config[field.key];
        if (field.type === "secret") {
          // Skip the masked placeholder so "save" without retyping keeps the stored secret.
          if (typeof value === "string" && value !== "" && value !== SECRET_MASK) {
            ops.push(this.upsertString(this.settingKey(name, field.key), value));
          }
        } else if (field.type === "boolean") {
          ops.push(this.upsertNumber(this.settingKey(name, field.key), value ? 1 : 0));
        } else if (typeof value === "string") {
          ops.push(this.upsertString(this.settingKey(name, field.key), value));
        } else if (typeof value === "number") {
          ops.push(this.upsertString(this.settingKey(name, field.key), String(value)));
        }
      }
    }
    await Promise.all(ops);
    return this.list();
  }

  private upsertString(key: string, value: string) {
    return this.prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  private upsertNumber(key: string, value: number) {
    return this.prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  // --- Generic queries used by the cron / provisioning lifecycle -------------------------------

  async activeModuleNames(kind?: ModuleKind): Promise<string[]> {
    const settings = await this.loadSettings();
    return MODULE_CATALOG
      .filter((module) => (kind ? module.kind === kind : true))
      .filter((module) => this.isActive(settings, module.name))
      .map((module) => module.name);
  }

  async anyActive(kind: ModuleKind): Promise<boolean> {
    return (await this.activeModuleNames(kind)).length > 0;
  }

  async firstActive(kind: ModuleKind): Promise<string | undefined> {
    return (await this.activeModuleNames(kind))[0];
  }

  async moduleActive(name: string): Promise<boolean> {
    const settings = await this.loadSettings();
    return this.isActive(settings, name);
  }

  // True when the given stored registrar identifier maps to a registrar module that is active right
  // now. Manual domains (registrar "none"/"manual"/empty) return false → skipped by the cron.
  async registrarActiveFor(registrar: string | null | undefined): Promise<boolean> {
    const name = canonicalModuleName(registrar);
    if (!name) {
      return false;
    }
    const def = moduleDefinition(name);
    if (!def || def.kind !== "registrar") {
      return false;
    }
    return this.moduleActive(name);
  }

  // --- Typed provider config (unmasked; .env fallback) -----------------------------------------

  async resellbiz(): Promise<ResellbizConfig> {
    const settings = await this.loadSettings();
    const module = moduleDefinition("resellbiz")!;
    const field = (key: string) => module.fields.find((f) => f.key === key)!;
    const modeRaw = this.resolveString(settings, "resellbiz", field("mode")).toLowerCase();
    const mode: "test" | "live" = modeRaw.includes("live") || modeRaw === "production" ? "live" : "test";
    // If the admin never picked a mode, honor an explicit RESELLBIZ_API_BASE_URL from .env.
    const explicitBase = !this.rawValue(settings, "resellbiz", "mode") ? process.env.RESELLBIZ_API_BASE_URL : undefined;
    const baseUrl = explicitBase && explicitBase.trim()
      ? explicitBase.trim()
      : mode === "live"
        ? RESELLBIZ_LIVE_BASE_URL
        : RESELLBIZ_TEST_BASE_URL;
    return {
      active: this.isActive(settings, "resellbiz"),
      apiKey: this.resolveString(settings, "resellbiz", field("apiKey")),
      resellerId: this.resolveString(settings, "resellbiz", field("resellerId")),
      mode,
      baseUrl,
      defaultNs: parseNameServers(this.resolveString(settings, "resellbiz", field("defaultNs")))
    };
  }

  async virtualmin(): Promise<VirtualminConfig> {
    const settings = await this.loadSettings();
    const module = moduleDefinition("virtualmin")!;
    const field = (key: string) => module.fields.find((f) => f.key === key)!;
    const allowSelfSignedRaw = this.resolveString(settings, "virtualmin", field("allowSelfSigned"));
    const storedSelfSigned = this.rawValue(settings, "virtualmin", "allowSelfSigned");
    const jobDelay = Number(this.resolveString(settings, "virtualmin", field("jobDelayMinutes")));
    return {
      active: this.isActive(settings, "virtualmin"),
      endpoint: this.resolveString(settings, "virtualmin", field("endpoint")),
      username: this.resolveString(settings, "virtualmin", field("username")),
      password: this.resolveString(settings, "virtualmin", field("password")),
      allowSelfSigned: storedSelfSigned === undefined
        ? allowSelfSignedRaw === "1" || allowSelfSignedRaw.toLowerCase() === "true"
        : storedSelfSigned === 1 || storedSelfSigned === true,
      jobDelayMinutes: Number.isFinite(jobDelay) && jobDelay > 0 ? jobDelay : 0
    };
  }
}

// Effective default name servers for a registration: customer-supplied wins, else the module default,
// else the platform default — always returning at least two entries.
export function resolveNameServers(customer: string[] | undefined, moduleDefault: string[]): string[] {
  const fromCustomer = (customer ?? []).map((ns) => ns.trim()).filter(Boolean);
  if (fromCustomer.length >= 2) {
    return fromCustomer;
  }
  const base = moduleDefault.length >= 2 ? moduleDefault : DEFAULT_NAME_SERVERS;
  if (fromCustomer.length === 1) {
    // Keep the one the customer chose, top up to two with the configured defaults.
    return [...new Set([...fromCustomer, ...base])].slice(0, Math.max(2, fromCustomer.length + 1));
  }
  return base;
}

export function parseNameServers(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((ns) => ns.trim())
    .filter(Boolean);
}
