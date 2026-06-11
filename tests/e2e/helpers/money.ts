/** Money helpers — the platform stores all amounts as integer cents (EUR). */

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100);
}

export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Human label, e.g. `46.00 EUR`. Matches the API's formatEuro(). */
export function formatEuro(cents: number): string {
  return `${centsToEuros(cents)} EUR`;
}
