import type { VirtualminCommandResult, VirtualminEntry, VirtualminReport } from "./virtualmin-types";

export function buildVirtualminReport(
  domain: string,
  results: Array<PromiseSettledResult<VirtualminCommandResult>>
): VirtualminReport {
  const errors: string[] = [];
  const byProgram = new Map<string, VirtualminCommandResult>();

  for (const result of results) {
    if (result.status === "rejected") {
      errors.push(String(result.reason instanceof Error ? result.reason.message : result.reason));
      continue;
    }

    byProgram.set(result.value.program, result.value);
    if (!result.value.ok) {
      errors.push(`${result.value.program}: ${result.value.message ?? "Virtualmin reported failure"}`);
    }
  }

  const domains = byProgram.get("list-domains")?.entries ?? [];
  const domainEntry = findDomainEntry(domains, domain);

  return {
    bandwidth: byProgram.get("list-bandwidth")?.entries ?? [],
    databases: byProgram.get("list-databases")?.entries ?? [],
    domain,
    domainFields: domainEntry?.fields ?? {},
    errors,
    mailboxes: byProgram.get("list-users")?.entries ?? [],
    webmailUrl: `https://webmail.${domain}`
  };
}

function findDomainEntry(entries: VirtualminEntry[], domain: string): VirtualminEntry | undefined {
  const cleanDomain = domain.toLowerCase();
  return entries.find((entry) => entry.name.toLowerCase() === cleanDomain) ?? entries[0];
}
