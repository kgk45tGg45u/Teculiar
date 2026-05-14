"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders } from "../../../../lib/api";

export default function PaymentMethodReturnPage() {
  const [message, setMessage] = useState("Confirming payment authorization...");

  useEffect(() => {
    fetch(`${API_BASE_URL}/billing/payment-methods`, { headers: authHeaders("client") })
      .then((response) => response.json())
      .then((methods) => {
        const pending = Array.isArray(methods) ? methods.find((method) => method.status === "PENDING") : undefined;
        if (!pending?.id) {
          window.location.assign("/client/payments");
          return;
        }
        return fetch(`${API_BASE_URL}/billing/payment-methods/${pending.id}/confirm`, {
          headers: authHeaders("client"),
          method: "POST"
        });
      })
      .then((response) => {
        if (!response) {
          return;
        }
        if (response.ok) {
          window.location.assign("/client/payments");
          return;
        }
        setMessage("Payment authorization could not be confirmed.");
      })
      .catch(() => setMessage("Payment authorization failed."));
  }, []);

  return <main className="container"><h1>Payments</h1><p>{message}</p></main>;
}
