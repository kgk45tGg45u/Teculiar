import { resolveTxt } from "node:dns/promises";

/**
 * DNS-TXT domain-ownership verification (Phase 4.6f). Before a customer's hostname goes ACTIVE
 * (= resolvable + TLS-issuable at the edge), the customer proves control of the domain by publishing
 * `_teculiar-verify.<name> TXT "<token>"`. One TXT at the registrable domain covers every subdomain:
 * for `admin.acmehost.com` we accept the token at `_teculiar-verify.admin.acmehost.com` OR
 * `_teculiar-verify.acmehost.com` (walking up the labels), so the customer adds a single record.
 */

export type TxtResolver = (name: string) => Promise<string[][]>;

/** The `_teculiar-verify.` TXT names accepted for a host, most-specific first, down to 2 labels. */
export function verificationCandidates(host: string): string[] {
  const labels = host.toLowerCase().split(":")[0]!.split(".").filter(Boolean);
  const names: string[] = [];
  for (let start = 0; start <= labels.length - 2; start += 1) {
    names.push(`_teculiar-verify.${labels.slice(start).join(".")}`);
  }
  return names;
}

/**
 * True when any accepted TXT name for `host` carries `token`. DNS errors (NXDOMAIN, timeouts) on one
 * candidate just move on to the next — absence of proof is a normal, expected state while the customer
 * is still setting the record.
 */
export async function hasVerificationToken(
  host: string,
  token: string,
  resolver: TxtResolver = resolveTxt
): Promise<boolean> {
  for (const name of verificationCandidates(host)) {
    try {
      const records = await resolver(name);
      // DNS TXT values arrive as chunk arrays; long values are split — join before comparing.
      if (records.some((chunks) => chunks.join("") === token)) {
        return true;
      }
    } catch {
      // try the next candidate
    }
  }
  return false;
}
