import { normalizeMailboxUser, quotaBlocksFromMb } from "./virtualmin-normalize";

export type VirtualminAction = {
  params: Record<string, string | undefined>;
  program: string;
};

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

  return undefined;
}
