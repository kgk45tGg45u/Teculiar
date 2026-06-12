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

async function doConfirm(invoiceId: string): Promise<ConfirmResult | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/confirm-payment`, {
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    return await response.json() as ConfirmResult;
  } catch {
    return null;
  }
}

function applyResult(result: ConfirmResult, invoiceId: string): { redirect?: string; message?: string; showNewOrderLink?: boolean } {
  if (result.accessToken && result.user) {
    try {
      storeAuth({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken ?? "",
        tokenType: "Bearer",
        user: result.user
      });
    } catch {
      // Storage quota or security error — token already in cookie from the server.
    }
  }

  const id = result.invoice?.id ?? invoiceId;

  if (result.status === "PAID") {
    return { redirect: `/client?invoice=${encodeURIComponent(id)}` };
  }
  if (result.status === "PENDING") {
    return { message: "Your payment is being processed. You will be notified by email once confirmed." };
  }
  if (result.status === "FAILED") {
    if (result.accessToken) {
      return { redirect: `/client?invoice=${encodeURIComponent(id)}&paymentFailed=1` };
    }
    return { message: "Payment was not completed. You can place a new order and choose a different payment method.", showNewOrderLink: true };
  }

  // For any other status (including error responses from the API), redirect if we have auth.
  if (result.accessToken || authHeaders("client").Authorization) {
    return { redirect: `/client?invoice=${encodeURIComponent(id)}` };
  }
  return {
    message: result.status ? `Payment status: ${result.status}` : "Payment confirmation failed.",
    showNewOrderLink: true
  };
}

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

    void (async () => {
      let result = await doConfirm(invoiceId);

      // If the first attempt returned null (fetch error) or a non-terminal status, retry once
      // after a short pause.  This recovers from a race where the PayPal webhook has not yet
      // processed the payment by the time the browser's payment-return page fires.
      if (!result || !["PAID", "PENDING", "FAILED"].includes(result.status ?? "")) {
        await new Promise((res) => setTimeout(res, 3000));
        const retry = await doConfirm(invoiceId);
        if (retry) result = retry;
      }

      if (!result) {
        setMessage("Could not confirm your payment. Please refresh the page or contact support.");
        setShowNewOrderLink(true);
        return;
      }

      const action = applyResult(result, invoiceId);
      if (action.redirect) {
        window.location.assign(action.redirect);
      } else {
        setMessage(action.message ?? "");
        setShowNewOrderLink(action.showNewOrderLink ?? false);
      }
    })();
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
