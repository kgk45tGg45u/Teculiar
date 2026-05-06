import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { callVirtualmin } from "../virtualmin-client/virtualmin-api";
import { createDomainAction } from "../virtualmin-client/virtualmin-actions";
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
    const result = await callVirtualmin(credentials, action.program, action.params);

    return {
      externalId: domainName,
      status: result.ok ? ("ACTIVE" as const) : ("FAILED" as const),
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
      mailboxes: pickField(entry.fields, ["Maximum mailboxes", "max_mailboxes", "Max mailboxes"])
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
