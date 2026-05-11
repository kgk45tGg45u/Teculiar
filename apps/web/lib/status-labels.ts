export function orderStatusLabel(status: string) {
  if (status === "COMPLETE") {
    return "Completed";
  }
  if (status === "CANCELLED") {
    return "Canceled";
  }
  if (["PENDING_PAYMENT", "PAID", "PROVISIONING"].includes(status)) {
    return "Pending";
  }
  return humanStatus(status);
}

export function serviceStatusLabel(status: string) {
  if (status === "ACTIVE") {
    return "Active";
  }
  if (["ORDERED", "PENDING", "PROVISIONING"].includes(status)) {
    return "Pending";
  }
  return humanStatus(status);
}

export function invoiceStatusLabel(status: string) {
  return humanStatus(status);
}

function humanStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ").replace(/^\w/, (value) => value.toUpperCase());
}
