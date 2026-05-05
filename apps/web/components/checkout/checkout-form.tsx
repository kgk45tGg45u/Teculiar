"use client";

import { useMemo, useState } from "react";
import { API_BASE_URL, money, type ApiProduct } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./checkout-form.module.css";

type CheckoutFormProps = {
  initialDomain?: string;
  initialDomainAction?: "register" | "transfer";
  locale: string;
  product: ApiProduct;
};

type CheckoutState =
  | { status: "idle"; message?: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string; orderId: string }
  | { status: "error"; message: string };

export function CheckoutForm({ initialDomain = "", initialDomainAction = "register", locale, product }: CheckoutFormProps) {
  const [priceId, setPriceId] = useState(product.prices[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [domainAction, setDomainAction] = useState<"register" | "transfer">(initialDomainAction);
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
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setState({ status: "error", message: "Passwoerter stimmen nicht ueberein." });
      return;
    }
    if (!isStrongPassword(password)) {
      setState({ status: "error", message: "Passwort erfuellt die Regeln nicht." });
      return;
    }

    setState({ status: "loading", message: "Bestellung wird erstellt..." });
    const domainName = String(formData.get("domainName") ?? "").trim().toLowerCase();
    const phone = `${String(formData.get("phoneCountryCode") ?? "").trim()} ${String(formData.get("phone") ?? "").trim()}`.trim();
    const body = {
      customer: {
        address: {
          city: formData.get("city"),
          line1: formData.get("address"),
          postalCode: formData.get("postalCode"),
          state: formData.get("state")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("companyName") ?? "").trim() ? "BUSINESS" : "INDIVIDUAL",
        email: String(formData.get("email") ?? ""),
        companyName: String(formData.get("companyName") ?? ""),
        name: String(formData.get("name") ?? ""),
        password,
        phone,
        vatId: String(formData.get("vatId") ?? "")
      },
      items: [
        {
          configuration: needsDomain
            ? {
                domainAction,
                nameServers: String(formData.get("nameServers") ?? "")
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
                transferAuthCode: String(formData.get("transferAuthCode") ?? "")
              }
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
        message: "Bezahlt. Bestellung wurde an ResellBiz Test API gesendet.",
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
              <input defaultValue={initialDomain} name="domainName" placeholder="example.de" required />
            </label>
            <label>
              Domain-Aktion
              <select value={domainAction} onChange={(event) => setDomainAction(event.target.value as "register" | "transfer")}>
                <option value="register">Registrieren</option>
                <option value="transfer">Transfer</option>
              </select>
            </label>
            {domainAction === "transfer" ? (
              <label>
                Auth-Code
                <input name="transferAuthCode" required />
              </label>
            ) : null}
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
            <input maxLength={16} minLength={9} name="password" required type="password" />
            <span className={styles.hint}>9-16 Zeichen, Gross-/Kleinbuchstaben, Zahlen, Sonderzeichen</span>
          </label>
          <label>
            Passwort bestaetigen
            <input maxLength={16} minLength={9} name="confirmPassword" required type="password" />
          </label>
          <label>
            Firma
            <input name="companyName" />
          </label>
          <label>
            USt-Id
            <input name="vatId" />
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
            Bundesland
            <input name="state" required />
          </label>
          <label>
            Landesvorwahl
            <input defaultValue="+49" name="phoneCountryCode" required />
          </label>
          <label>
            Telefon
            <input name="phone" required />
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

function isStrongPassword(password: string) {
  return (
    password.length >= 9 &&
    password.length <= 16 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[~*!@$#%_+.?:,{}]/.test(password)
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
