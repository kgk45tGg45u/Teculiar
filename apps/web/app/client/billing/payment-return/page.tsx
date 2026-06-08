"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, storeAuth, type AuthPayload } from "../../../../lib/api";

type ConfirmResult = {
  status: string;
  invoice?: { id?: string; userId?: string; status?: string };
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  user?: AuthPayload["user"];
};

export default function PaymentReturnPage() {
  const [message, setMessage] = useState("Confirming your payment…");
  const [showNewOrderLink, setShowNewOrderLink] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get("invoiceId");

    if (!invoiceId) {
      setMessage("No invoice found. Please contact support if you completed a payment.");
      return;
    }

    void fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/confirm-payment`, {
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    })
      .then((response) => response.json() as Promise<ConfirmResult>)
      .then((result) => {
        // Auto-login: if the backend issued a token (new guest customer), store it
        if (result.accessToken && result.user) {
          storeAuth({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken ?? "",
            tokenType: "Bearer",
            user: result.user
          });
        }

        const id = result.invoice?.id ?? invoiceId;

        if (result.status === "PAID") {
          window.location.assign(`/client?invoice=${encodeURIComponent(id)}`);
          return;
        }

        if (result.status === "PENDING") {
          setMessage("Your payment is being processed. You will be notified by email once confirmed.");
          return;
        }

        if (result.status === "FAILED") {
          if (result.accessToken) {
            window.location.assign(`/client?invoice=${encodeURIComponent(id)}&paymentFailed=1`);
          } else {
            // Unauthenticated new customer — payment canceled or failed before completion
            setMessage("Payment was not completed. You can place a new order and choose a different payment method.");
            setShowNewOrderLink(true);
          }
          return;
        }

        // Any other status — attempt to redirect if logged in
        if (result.accessToken || authHeaders("client").Authorization) {
          window.location.assign(`/client?invoice=${encodeURIComponent(id)}`);
        } else {
          setMessage(result.status ? `Payment status: ${result.status}` : "Payment confirmation failed.");
          setShowNewOrderLink(true);
        }
      })
      .catch(() => setMessage("Could not confirm your payment. Please contact support."));
  }, []);

  return (
    <main style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60dvh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 12 }}>Payment</h1>
        <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>{message}</p>
        {showNewOrderLink ? (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <a
              href="/"
              style={{ display: "inline-block", padding: "10px 22px", background: "var(--dezhost)", color: "white", borderRadius: 8, fontWeight: 700, fontSize: "0.9rem", textDecoration: "none" }}
            >
              ← Place a new order
            </a>
            <a href="/de/contact" style={{ fontSize: "0.82rem", color: "var(--muted)", textDecoration: "underline" }}>
              Contact support
            </a>
          </div>
        ) : null}
      </div>
    </main>
  );
}
