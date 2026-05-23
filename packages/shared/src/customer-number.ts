export function formatCustomerNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number <= 0) {
    return "-";
  }
  return String(number).padStart(6, "0");
}
