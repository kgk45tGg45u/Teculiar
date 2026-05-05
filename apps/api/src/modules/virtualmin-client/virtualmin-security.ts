import type { VirtualminAction } from "./virtualmin-actions";
import type { VirtualminCommandResult, VirtualminCredentials } from "./virtualmin-types";

export function adminCredentialsFromEnv(
  env: NodeJS.ProcessEnv,
  fallback: Pick<VirtualminCredentials, "allowSelfSigned" | "endpoint">
): VirtualminCredentials | undefined {
  const username = env.VIRTUALMIN_ADMIN_USERNAME?.trim();
  const password = env.VIRTUALMIN_ADMIN_PASSWORD;

  if (!username || !password) {
    return undefined;
  }

  return {
    allowSelfSigned: env.VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED
      ? env.VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED === "1" || env.VIRTUALMIN_ADMIN_ALLOW_SELF_SIGNED === "true"
      : fallback.allowSelfSigned,
    endpoint: env.VIRTUALMIN_ADMIN_ENDPOINT?.trim() || fallback.endpoint,
    password,
    username
  };
}

export function assertSafeDomain(domain: string): string {
  const clean = domain.trim().toLowerCase();

  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(clean)) {
    throw new Error("Invalid domain");
  }

  return clean;
}

export function forceActionDomain(action: VirtualminAction, domain: string): VirtualminAction {
  return {
    params: {
      ...action.params,
      domain
    },
    program: action.program
  };
}

export function isDomainOwnedByUser(result: VirtualminCommandResult, domain: string): boolean {
  if (!result.ok) {
    return false;
  }

  const clean = domain.toLowerCase();
  return result.entries.some((entry) => entry.name.toLowerCase() === clean);
}

export function isRemoteCommandDenied(result: VirtualminCommandResult): boolean {
  return /not allowed to run remote commands/i.test(result.text) || /not allowed to run remote commands/i.test(result.message ?? "");
}
