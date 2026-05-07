import { normalizeMailboxUser, quotaBlocksFromMb } from "./virtualmin-normalize";

export type VirtualminAction = {
  params: Record<string, string | undefined>;
  program: string;
};

export type VirtualminCreateDomainInput = {
  contactEmail?: string;
  description?: string;
  domainName: string;
  password: string;
  plan?: string;
  template?: string;
};

export function createDomainAction(input: VirtualminCreateDomainInput): {
  params: Record<string, boolean | string | undefined>;
  program: string;
} {
  return {
    params: {
      desc: input.description,
      domain: input.domainName,
      email: input.contactEmail,
      "features-from-plan": true,
      "limits-from-plan": true,
      pass: input.password,
      plan: input.plan,
      "skip-warnings": true,
      template: input.template
    },
    program: "create-domain"
  };
}

export function actionFromBody(body: Record<string, string | undefined>): VirtualminAction | undefined {
  const domain = body.domain?.trim();

  if (!domain) {
    return undefined;
  }

  if (body.intent === "add-email") {
    return {
      params: {
        domain,
        pass: body.mailPassword,
        quota: quotaBlocksFromMb(body.mailQuotaMb ?? ""),
        user: normalizeMailboxUser(body.mailUser ?? "", domain)
      },
      program: "create-user"
    };
  }

  if (body.intent === "remove-email") {
    return {
      params: { domain, user: normalizeMailboxUser(body.mailUser ?? "", domain) },
      program: "delete-user"
    };
  }

  if (body.intent === "change-email-password") {
    return {
      params: {
        domain,
        pass: body.mailPassword,
        user: normalizeMailboxUser(body.mailUser ?? "", domain)
      },
      program: "modify-user"
    };
  }

  if (body.intent === "edit-email-quota") {
    return {
      params: {
        domain,
        quota: quotaBlocksFromMb(body.mailQuotaMb ?? ""),
        user: normalizeMailboxUser(body.mailUser ?? "", domain)
      },
      program: "modify-user"
    };
  }

  if (body.intent === "add-database") {
    return {
      params: { domain, name: body.databaseName, type: body.databaseType || "mysql" },
      program: "create-database"
    };
  }

  if (body.intent === "remove-database") {
    return {
      params: { domain, name: body.databaseName, type: body.databaseType || "mysql" },
      program: "delete-database"
    };
  }

  if (body.intent === "change-database-password") {
    return {
      params: { domain, pass: body.databasePassword, type: body.databaseType || "mysql" },
      program: "modify-database-pass"
    };
  }

  if (body.intent === "add-subdomain") {
    return {
      params: { domain: subdomainName(body.subdomain ?? "", domain), parent: domain, "skip-warnings": "true" },
      program: "create-domain"
    };
  }

  if (body.intent === "remove-subdomain") {
    return {
      params: { domain: subdomainName(body.subdomain ?? "", domain) },
      program: "delete-domain"
    };
  }

  if (body.intent === "add-ftp") {
    return {
      params: { domain, ftp: "true", pass: body.ftpPassword, user: body.ftpUser },
      program: "create-user"
    };
  }

  if (body.intent === "remove-ftp") {
    return {
      params: { domain, user: body.ftpUser },
      program: "delete-user"
    };
  }

  if (body.intent === "change-ftp-password") {
    return {
      params: { domain, pass: body.ftpPassword, user: body.ftpUser },
      program: "modify-user"
    };
  }

  if (body.intent === "edit-ftp-quota") {
    return {
      params: { domain, quota: quotaBlocksFromMb(body.ftpQuotaMb ?? ""), user: body.ftpUser },
      program: "modify-user"
    };
  }

  if (body.intent === "change-admin-password") {
    return {
      params: { domain, pass: body.adminPassword },
      program: "modify-domain"
    };
  }

  return undefined;
}

function subdomainName(value: string, domain: string) {
  const clean = value.trim().toLowerCase();
  if (clean.endsWith(`.${domain.toLowerCase()}`)) {
    return clean;
  }
  return `${clean}.${domain.toLowerCase()}`;
}
