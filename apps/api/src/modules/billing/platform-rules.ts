export function formatOrderNumber(next: number) {
  return fixedNumber(next, 6, "Order number");
}

export function formatInvoiceNumber(next: number) {
  return fixedNumber(next, 7, "Invoice number");
}

export function formatFinalInvoiceNumber(next: number) {
  return fixedNumber(next, 6, "Final invoice number");
}

export function formatTemporaryInvoiceNumber(next: number, prefix = "N-") {
  return `${prefix}${fixedNumber(next, 6, "Temporary invoice number")}`;
}

export function addBillingCycle(date: Date, cycle: string) {
  const next = new Date(date);
  const yearly = cycle.match(/^YEAR_(\d+)$/);
  const months = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMI_ANNUAL: 6
  }[cycle];

  next.setMonth(next.getMonth() + (yearly ? Number(yearly[1]) * 12 : months ?? 1));
  return next;
}

export function shouldCloseAnsweredTicket(status: string, updatedAt: Date, now: Date, closeAfterHours: number) {
  if (status !== "ANSWERED") {
    return false;
  }

  return now.getTime() - updatedAt.getTime() >= closeAfterHours * 60 * 60 * 1000;
}

function fixedNumber(next: number, digits: number, label: string) {
  if (!Number.isInteger(next) || next < 1) {
    throw new Error(`${label} must be a positive integer`);
  }

  const value = String(next);
  if (value.length > digits) {
    throw new Error(`${label} must fit in ${digits} digits`);
  }

  return value.padStart(digits, "0");
}
