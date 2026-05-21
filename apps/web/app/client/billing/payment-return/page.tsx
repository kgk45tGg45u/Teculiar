"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders } from "../../../../lib/api";

export default function PaymentReturnPage() {
  const [message, setMessage] = useState("Confirming payment...");

  useEffect(() => {
    const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
    if (!invoiceId) {
      setMessage("Payment invoice missing.");
      return;
    }
    void fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/confirm-payment`, {
      headers: authHeaders("client"),
      method: "POST"
    })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (ok && payload.status === "PAID") {
          window.location.assign(`/client?invoice=${encodeURIComponent(payload.invoice?.id ?? invoiceId)}`);
          return;
        }
        setMessage(payload?.message ?? `Payment status: ${payload?.status ?? "pending"}`);
      })
      .catch(() => setMessage("Payment confirmation failed."));
  }, []);

  return <main className="container"><h1>Payment</h1><p>{message}</p></main>;
}
