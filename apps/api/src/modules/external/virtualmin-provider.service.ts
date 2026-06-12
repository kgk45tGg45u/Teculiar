import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { callVirtualmin } from "../virtualmin-client/virtualmin-api";
import { actionFromBody, createDomainAction } from "../virtualmin-client/virtualmin-actions";
import { buildVirtualminReport } from "../virtualmin-client/virtualmin-report";
import { pickField } from "../virtualmin-client/virtualmin-normalize";
import { adminCredentialsFromEnv, assertSafeDomain } from "../virtualmin-client/virtualmin-security";
import type { VirtualminCredentials, VirtualminEntry } from "../virtualmin-client/virtualmin-types";
import type { HostingProvider, ProvisioningRequest } from "./provider.types";

@Injectable()
export class VirtualminProviderService implements HostingProvider {
  async provision(request: ProvisioningRequest) {
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return {
        externalId: `virtualmin_${request.serviceId}`,
        status: "QUEUED" as const,
        metadata: {
          panel: "virtualmin",
          reason: "Virtualmin admin credentials are not configured.",
          requestedOptions: request.options
        }
      };
    }

    const domainName = domainFromOptions(request.options);
    const action = createDomainAction({
      contactEmail: stringOption(request.options, "contactEmail"),
      description: stringOption(request.options, "description") ?? domainName,
      domainName,
      password: generateVirtualminPassword(),
      plan: stringOption(request.options, "virtualminPlan"),
      template: stringOption(request.options, "virtualminTemplate")
    });
    const result = await callVirtualmin(credentials, action.program, action.params).catch((error: unknown) => {
      if (error instanceof Error && /timed out/i.test(error.message)) {
        return {
          entries: [],
          json: undefined,
          message: error.message,
          ok: false,
          program: action.program,
          text: ""
        };
      }

      throw error;
    });

    return {
      externalId: domainName,
      status: result.ok ? ("ACTIVE" as const) : result.message === "Virtualmin request timed out" ? ("QUEUED" as const) : ("FAILED" as const),
      metadata: {
        panel: "virtualmin",
        program: result.program,
        requestedOptions: request.options,
        result: result.message ?? result.text.slice(0, 500)
      }
    };
  }

  async listHostingTemplates() {
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return { plans: [], templates: [], warning: "Virtualmin admin credentials are not configured." };
    }

    const [plans, templates] = await Promise.all([
      callVirtualmin(credentials, "list-plans", { multiline: true }),
      callVirtualmin(credentials, "list-templates", { multiline: true })
    ]);

    return {
      plans: plans.entries.map(planOption),
      templates: templates.entries.map(templateOption),
      warning: plans.ok && templates.ok ? undefined : "Virtualmin returned an error while loading hosting templates."
    };
  }

  async restart(serviceExternalId: string) {
    return {
      accepted: true,
      operationId: `vm-restart-${serviceExternalId}-${randomUUID()}`
    };
  }

  // Suspend (disable) a hosting account on the panel for non-payment. This does NOT delete the
  // account — Virtualmin must never auto-terminate; the data stays and `enable` restores it.
  async disable(serviceExternalId: string) {
    return this.toggleDomain(serviceExternalId, "disable-domain");
  }

  // Unsuspend (re-enable) a previously disabled hosting account, e.g. after the overdue invoice is paid.
  async enable(serviceExternalId: string) {
    return this.toggleDomain(serviceExternalId, "enable-domain");
  }

  private async toggleDomain(serviceExternalId: string, program: "disable-domain" | "enable-domain") {
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return { accepted: false, reason: "Virtualmin admin credentials are not configured." };
    }
    const domain = assertSafeDomain(serviceExternalId);
    const result = await callVirtualmin(credentials, program, { domain }).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : "Virtualmin request failed"
    }));
    return { accepted: Boolean((result as { ok?: boolean }).ok), message: (result as { message?: string }).message, program };
  }

  async status(serviceExternalId: string) {
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return {
        externalId: serviceExternalId,
        status: "QUEUED" as const,
        metadata: { panel: "virtualmin", reason: "Virtualmin admin credentials are not configured." }
      };
    }

    const domainName = assertSafeDomain(serviceExternalId);
    let result;
    try {
      result = await callVirtualmin(credentials, "list-domains", { domain: domainName, multiline: true });
    } catch (error) {
      // The panel is unreachable (network error / HTTP error / timeout). This is INCONCLUSIVE — we
      // must not let a transient outage flip every live service to inactive. "QUEUED" is treated as
      // "unknown" by refreshService, which leaves ACTIVE services untouched.
      return {
        externalId: domainName,
        status: "QUEUED" as const,
        metadata: { panel: "virtualmin", reason: "unreachable", result: error instanceof Error ? error.message : "Virtualmin status check failed" }
      };
    }

    // Only trust the parsed domain list — NOT result.text.includes(domainName). The previous code
    // matched the domain name inside Virtualmin's own error string ("Virtual server X does not
    // exist"), so a missing account was reported ACTIVE. That made the admin "active services"
    // count a lie (e.g. 110 ACTIVE while the panel held a handful of real virtual servers).
    const present = result.entries.some((entry) => entry.name === domainName || entry.name.endsWith(`.${domainName}`));
    if (present) {
      return { externalId: domainName, status: "ACTIVE" as const, metadata: { panel: "virtualmin", program: result.program } };
    }

    // A definitive "does not exist" reply means the account is genuinely gone from the panel.
    const json = (typeof result.json === "object" && result.json !== null ? result.json : {}) as Record<string, unknown>;
    const errorText = String(json.full_error ?? json.error ?? result.text ?? "");
    if (/does not exist/i.test(errorText)) {
      return {
        externalId: domainName,
        status: "FAILED" as const,
        metadata: { panel: "virtualmin", reason: "not_found_on_panel", result: errorText.slice(0, 500) }
      };
    }

    // Reachable, no error, but the domain is not listed yet → still provisioning.
    return {
      externalId: domainName,
      status: "PROVISIONING" as const,
      metadata: { panel: "virtualmin", program: result.program, result: result.message ?? result.text.slice(0, 500) }
    };
  }

  async hostingControlPanel(serviceExternalId: string) {
    const domainName = assertSafeDomain(serviceExternalId);
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return emptyControlPanel(domainName, "Virtualmin admin credentials are not configured.");
    }

    const results = await Promise.allSettled([
      callVirtualmin(credentials, "list-domains", { domain: domainName, multiline: true }),
      callVirtualmin(credentials, "list-domains", { multiline: true, parent: domainName, subserver: true }),
      callVirtualmin(credentials, "list-users", { domain: domainName, "mail-size": true, multiline: true }),
      callVirtualmin(credentials, "list-databases", { domain: domainName, multiline: true }),
      callVirtualmin(credentials, "list-bandwidth", { domain: domainName, multiline: true })
    ]);
    const report = buildVirtualminReport(domainName, [results[0], results[2], results[3], results[4]]);
    const subdomainEntries = results[1]?.status === "fulfilled" ? results[1].value.entries : [];
    const endpoint = new URL(credentials.endpoint);
    const domainFields = expandValues(report.domainFields);
    const users = report.mailboxes.map((entry) => ({ ...entry, fields: expandValues(entry.fields) }));

    return {
      bandwidth: report.bandwidth,
      bandwidthUsage: usageFromBytes(
        valueFrom(domainFields, "bandwidth_byte_usage"),
        valueFrom(domainFields, "bandwidth_byte_limit"),
        valueFrom(domainFields, "bandwidth_usage"),
        valueFrom(domainFields, "bandwidth_limit")
      ),
      controlPanelUrl: endpoint.origin,
      databases: report.databases,
      diskUsage: usageFromBytes(
        valueFrom(domainFields, "server_byte_quota_used"),
        valueFrom(domainFields, "server_block_quota"),
        valueFrom(domainFields, "server_quota_used"),
        valueFrom(domainFields, "server_quota")
      ),
      domain: domainName,
      emailInstructions: emailInstructions(domainName),
      errors: report.errors,
      ftpUsers: users.filter((entry) => valueFrom(entry.fields, "ftp_access") === "Yes").map(userPanelEntry),
      mailboxes: users.filter((entry) => valueFrom(entry.fields, "email_address")).map(userPanelEntry),
      subdomains: subdomainEntries.filter((entry) => entry.name.endsWith(`.${domainName}`)),
      webmailUrl: report.webmailUrl
    };
  }

  async hostingControlAction(serviceExternalId: string, body: Record<string, string | undefined>) {
    const domainName = assertSafeDomain(serviceExternalId);
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return { accepted: false, message: "Virtualmin admin credentials are not configured." };
    }
    const action = actionFromBody({ ...body, domain: domainName });
    if (!action) {
      return { accepted: false, message: "Unknown hosting control action." };
    }
    const result = await callVirtualmin(credentials, action.program, action.params);
    return { accepted: result.ok, message: result.message ?? result.text.slice(0, 500), program: result.program };
  }
}

function credentialsFromEnv(): VirtualminCredentials | undefined {
  return adminCredentialsFromEnv(process.env, {
    allowSelfSigned: process.env.VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED === "1",
    endpoint: process.env.VIRTUALMIN_ADMIN_ENDPOINT ?? ""
  });
}

function domainFromOptions(options: Record<string, unknown>) {
  const domain = stringOption(options, "domainName");
  if (!domain) {
    throw new Error("Hosting provisioning needs a domain name");
  }

  return assertSafeDomain(domain);
}

function stringOption(options: Record<string, unknown>, key: string) {
  const value = options[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function planOption(entry: VirtualminEntry) {
  return {
    id: pickField(entry.fields, ["ID", "Plan ID", "id"]) ?? entry.name,
    name: pickField(entry.fields, ["Name", "Plan", "Description"]) ?? entry.name,
    limits: {
      bandwidth: pickField(entry.fields, ["Bandwidth limit", "Maximum bandwidth", "max_bw", "Max bandwidth"]),
      databases: pickField(entry.fields, ["Maximum databases", "max_dbs", "Max databases"]),
      disk: pickField(entry.fields, ["Quota", "Server block quota", "server_quota"]),
      mailboxes: pickField(entry.fields, ["Maximum mailboxes", "max_mailboxes", "Max mailboxes"]),
      subServers: pickField(entry.fields, ["Maximum sub-servers", "max_subservers", "Max sub-servers", "Sub-servers"])
    },
    raw: entry.fields
  };
}

function templateOption(entry: VirtualminEntry) {
  return {
    id: pickField(entry.fields, ["ID", "Template ID", "id"]) ?? entry.name,
    name: pickField(entry.fields, ["Name", "Template", "Description"]) ?? entry.name,
    raw: entry.fields
  };
}

function generateVirtualminPassword() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  return `Dz${suffix}!9Aa`;
}

function emptyControlPanel(domain: string, warning: string) {
  return {
    bandwidth: [],
    controlPanelUrl: "",
    databases: [],
    diskUsage: undefined,
    domain,
    emailInstructions: emailInstructions(domain),
    errors: [warning],
    ftpUsers: [],
    mailboxes: [],
    subdomains: [],
    webmailUrl: `https://webmail.${domain}`
  };
}

function emailInstructions(domain: string) {
  return {
    imap: { encryption: "SSL/TLS", port: 993, server: `mail.${domain}` },
    pop3: { encryption: "SSL/TLS", port: 995, server: `mail.${domain}` },
    smtp: { encryption: "STARTTLS", port: 587, server: `mail.${domain}` },
    username: "Use the full email address as username."
  };
}

function expandValues(fields: Record<string, string>) {
  const values = virtualminValues(fields.values);
  return { ...fields, ...Object.fromEntries(Object.entries(values).map(([key, item]) => [key, item[0] ?? ""])) };
}

function virtualminValues(value: unknown): Record<string, string[]> {
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, string[]> : {};
  } catch {
    return {};
  }
}

function valueFrom(fields: Record<string, string>, key: string) {
  return fields[key] || fields[key.replace(/_/g, "-")];
}

function usageFromBytes(usedBytes?: string, limitBytes?: string, usedLabel?: string, limitLabel?: string) {
  const used = Number(usedBytes);
  const limit = Number(limitBytes);
  return {
    limit: limitLabel ?? (Number.isFinite(limit) ? humanBytes(limit) : "Unknown"),
    percent: Number.isFinite(used) && Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    used: usedLabel ?? (Number.isFinite(used) ? humanBytes(used) : "0 bytes")
  };
}

function userPanelEntry(entry: VirtualminEntry) {
  const fields = entry.fields;
  return {
    address: valueFrom(fields, "email_address") ?? entry.name,
    fields,
    name: entry.name,
    usage: usageFromBytes(
      valueFrom(fields, "home_byte_quota_used") ?? valueFrom(fields, "mail_file_byte_size"),
      valueFrom(fields, "home_byte_quota"),
      valueFrom(fields, "home_quota_used") ?? valueFrom(fields, "mail_file_size"),
      valueFrom(fields, "home_quota")
    )
  };
}

function humanBytes(bytes: number) {
  if (bytes >= 1024 ** 4) {
    return `${(bytes / 1024 ** 4).toFixed(1)} TiB`;
  }
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  }
  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }
  return `${bytes} bytes`;
}
