"use client";

import { useMemo, useState } from "react";
import { API_BASE_URL, money, type ApiProduct } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./checkout-form.module.css";

type CheckoutFormProps = {
  locale: string;
  product: ApiProduct;
};

type CheckoutState =
  | { status: "idle"; message?: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string; orderId: string }
  | { status: "error"; message: string };

export function CheckoutForm({ locale, product }: CheckoutFormProps) {
  const [priceId, setPriceId] = useState(product.prices[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const selectedPrice = useMemo(
    () => product.prices.find((price) => price.id === priceId) ?? product.prices[0],
    [priceId, product.prices]
  );
  const needsDomain = product.type === "DOMAIN";

  async function submit(formData: FormData) {
    if (!selectedPrice) {
      setState({ status: "error", message: "Kein Preis fuer dieses Produkt gefunden." });
      return;
    }

    setState({ status: "loading", message: "Bestellung wird erstellt..." });
    const domainName = String(formData.get("domainName") ?? "").trim().toLowerCase();
    const body = {
      customer: {
        address: {
          city: formData.get("city"),
          line1: formData.get("address"),
          postalCode: formData.get("postalCode")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("customerType") ?? "INDIVIDUAL"),
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        password: String(formData.get("password") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        vatId: String(formData.get("vatId") ?? "")
      },
      items: [
        {
          configuration: needsDomain && formData.get("nameServers")
            ? { nameServers: String(formData.get("nameServers")).split(",").map((value) => value.trim()).filter(Boolean) }
            : {},
          domainName: needsDomain ? domainName : undefined,
          productId: product.id,
          productPriceId: selectedPrice.id,
          quantity: 1
        }
      ]
    };

    try {
      const checkoutResponse = await postJson<{ order: { id: string } }>("/orders/checkout", body);
      setState({ status: "loading", message: "Sandbox-Zahlung laeuft..." });
      await postJson(`/orders/${checkoutResponse.order.id}/pay`, {
        method: paymentMethod,
        paymentMethodId: "sandbox"
      });
      setState({
        status: "success",
        message: "Bezahlt. Domain-Registrierung wurde an ResellBiz Test API gesendet.",
        orderId: checkoutResponse.order.id
      });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Bestellung fehlgeschlagen." });
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.summary}>
        <span className="eyebrow">Checkout</span>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <div className={styles.price}>
          <strong>{selectedPrice ? money(selectedPrice.amountCents, selectedPrice.currency) : "Preis fehlt"}</strong>
          <span>{selectedPrice?.setupFeeCents ? `${money(selectedPrice.setupFeeCents)} Setup` : "0,00 EUR Setup"}</span>
        </div>
      </section>

      <form action={submit} className={styles.form}>
        <label>
          Abrechnung
          <select value={priceId} onChange={(event) => setPriceId(event.target.value)}>
            {product.prices.map((price) => (
              <option key={price.id} value={price.id}>
                {cycleLabel(price.billingCycle)} - {money(price.amountCents, price.currency)}
              </option>
            ))}
          </select>
        </label>

        {needsDomain ? (
          <>
            <label>
              Domain
              <input name="domainName" placeholder="example.de" required />
            </label>
            <label>
              Nameserver
              <input name="nameServers" placeholder="ns1.dezhost.test, ns2.dezhost.test" />
            </label>
          </>
        ) : null}

        <div className={styles.grid}>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            E-Mail
            <input name="email" required type="email" />
          </label>
          <label>
            Passwort
            <input name="password" required type="password" />
          </label>
          <label>
            Kundentyp
            <select name="customerType">
              <option value="INDIVIDUAL">Privat</option>
              <option value="BUSINESS">Firma</option>
            </select>
          </label>
          <label>
            Adresse
            <input name="address" required />
          </label>
          <label>
            PLZ
            <input name="postalCode" required />
          </label>
          <label>
            Stadt
            <input name="city" required />
          </label>
          <label>
            Land
            <input defaultValue="DE" name="countryCode" required />
          </label>
          <label>
            USt-Id
            <input name="vatId" />
          </label>
          <label>
            Telefon
            <input name="phone" />
          </label>
        </div>

        <label>
          Zahlung
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="CREDIT_CARD">Sandbox Kreditkarte</option>
            <option value="PAYPAL">Sandbox PayPal</option>
            <option value="SEPA">Sandbox SEPA</option>
          </select>
        </label>

        <Button type="submit">Kostenpflichtig bestellen</Button>
        {state.status !== "idle" ? (
          <p className={`${styles.message} ${styles[state.status]}`}>
            {state.message}
            {state.status === "success" ? (
              <>
                {" "}
                <a href={`/client?order=${state.orderId}`}>Zum Portal</a>
              </>
            ) : null}
          </p>
        ) : null}
      </form>
    </div>
  );
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "API request failed");
  }

  return payload as T;
}

function cycleLabel(cycle: string) {
  if (cycle === "MONTHLY") {
    return "Monatlich";
  }
  if (cycle.startsWith("YEAR_")) {
    return `${cycle.replace("YEAR_", "")} Jahr`;
  }

  return cycle;
}
