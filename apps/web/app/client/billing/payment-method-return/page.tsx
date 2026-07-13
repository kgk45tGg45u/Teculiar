"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, currentLocale } from "@teculiar/web-core/lib/api";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { surfaceHref } from "@teculiar/web-core/lib/surface";

export default function PaymentMethodReturnPage() {
  const c = getDictionary(currentLocale()).client.pay;
  const [message, setMessage] = useState(c.confirmingAuth);

  useEffect(() => {
    fetch(`${API_BASE_URL}/billing/payment-methods`, { headers: authHeaders("client") })
      .then((response) => response.json())
      .then((methods) => {
        const pending = Array.isArray(methods) ? methods.find((method) => method.status === "PENDING") : undefined;
        if (!pending?.id) {
          window.location.assign(surfaceHref(window.location.pathname, "/client/payments"));
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
          window.location.assign(surfaceHref(window.location.pathname, "/client/payments"));
          return;
        }
        setMessage(c.authNotConfirmed);
      })
      .catch(() => setMessage(c.authFailed));
  }, []);

  return <main className="container"><h1>{c.paymentsHeading}</h1><p>{message}</p></main>;
}
