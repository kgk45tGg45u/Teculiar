import { Injectable } from "@nestjs/common";
import { actionFromBody } from "./virtualmin-actions";
import { callVirtualmin } from "./virtualmin-api";
import { buildVirtualminReport } from "./virtualmin-report";
import {
  adminCredentialsFromEnv,
  assertSafeDomain,
  forceActionDomain,
  isDomainOwnedByUser,
  isRemoteCommandDenied
} from "./virtualmin-security";
import type { VirtualminCredentials, VirtualminReport } from "./virtualmin-types";

@Injectable()
export class VirtualminClientService {
  async runAction(credentials: VirtualminCredentials, body: Record<string, string | undefined>) {
    const domain = assertSafeDomain(body.domain ?? "");
    const execution = await this.executionCredentials(credentials, domain);
    const action = actionFromBody({ ...body, domain });

    if (!action) {
      return undefined;
    }

    const safeAction = forceActionDomain(action, execution.domain);
    return callVirtualmin(execution.credentials, safeAction.program, safeAction.params);
  }

  async loadReport(credentials: VirtualminCredentials, domain: string): Promise<VirtualminReport> {
    const execution = await this.executionCredentials(credentials, assertSafeDomain(domain));
    const results = await Promise.allSettled([
      callVirtualmin(execution.credentials, "list-domains", { domain: execution.domain, multiline: true }),
      callVirtualmin(execution.credentials, "list-users", {
        domain: execution.domain,
        "mail-size": true,
        multiline: true
      }),
      callVirtualmin(execution.credentials, "list-databases", { domain: execution.domain, multiline: true }),
      callVirtualmin(execution.credentials, "list-bandwidth", { domain: execution.domain, multiline: true })
    ]);

    return buildVirtualminReport(execution.domain, results);
  }

  private async executionCredentials(credentials: VirtualminCredentials, domain: string) {
    const admin = adminCredentialsFromEnv(process.env, credentials);

    if (!admin) {
      return { credentials, domain };
    }

    await this.verifyUserPassword(credentials, domain);
    const ownedDomain = await callVirtualmin(admin, "list-domains", {
      domain,
      multiline: true,
      user: credentials.username
    });

    if (!isDomainOwnedByUser(ownedDomain, domain)) {
      throw new Error("Domain does not belong to this user");
    }

    return { credentials: admin, domain };
  }

  private async verifyUserPassword(credentials: VirtualminCredentials, domain: string) {
    try {
      const result = await callVirtualmin(credentials, "list-domains", { domain, multiline: true });
      if (!result.ok && !isRemoteCommandDenied(result)) {
        throw new Error(result.message ?? "Virtualmin login failed");
      }
    } catch (error) {
      if (error instanceof Error && /HTTP 401/.test(error.message)) {
        throw new Error("Invalid Virtualmin username or password");
      }

      throw error;
    }
  }
}
