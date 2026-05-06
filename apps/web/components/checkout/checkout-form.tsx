"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, cycleLabel, money, type ApiProduct } from "../../lib/api";
import { Button } from "../ui/button";
import styles from "./checkout-form.module.css";

type CheckoutFormProps = {
  domainProduct?: ApiProduct;
  hostingProducts?: ApiProduct[];
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

type DomainCheck =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; action: "register" | "transfer"; available: boolean; domain: string; priceCents: number }
  | { status: "error"; message: string };

type CheckoutItem = {
  configuration: Record<string, unknown>;
  domainName?: string;
  productId: string;
  productPriceId: string;
  quantity: number;
};

export function CheckoutForm({
  domainProduct,
  hostingProducts = [],
  initialDomain = "",
  initialDomainAction = "register",
  locale,
  product
}: CheckoutFormProps) {
  const [priceId, setPriceId] = useState(product.prices[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [domainAction, setDomainAction] = useState<"register" | "transfer">(initialDomainAction);
  const [domainUse, setDomainUse] = useState<"register" | "transfer" | "external">(initialDomainAction);
  const [password, setPassword] = useState("");
  const [showHostingOffer, setShowHostingOffer] = useState(product.type === "DOMAIN" && hostingProducts.length > 0);
  const [addHosting, setAddHosting] = useState(false);
  const [domainNameInput, setDomainNameInput] = useState(initialDomain);
  const [hostingDomain, setHostingDomain] = useState(initialDomain);
  const [selectedHostingId, setSelectedHostingId] = useState(hostingProducts[0]?.id ?? "");
  const [selectedHostingPriceId, setSelectedHostingPriceId] = useState(hostingProducts[0]?.prices[0]?.id ?? "");
  const [domainCheck, setDomainCheck] = useState<DomainCheck>({ status: "idle" });
  const [vatPercent, setVatPercent] = useState(0);
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const selectedPrice = useMemo(
    () => product.prices.find((price) => price.id === priceId) ?? product.prices[0],
    [priceId, product.prices]
  );
  const selectedHosting = useMemo(
    () => hostingProducts.find((candidate) => candidate.id === selectedHostingId) ?? hostingProducts[0],
    [hostingProducts, selectedHostingId]
  );
  const selectedHostingPrice = useMemo(
    () => selectedHosting?.prices.find((price) => price.id === selectedHostingPriceId) ?? selectedHosting?.prices[0],
    [selectedHosting, selectedHostingPriceId]
  );
  const needsDomain = product.type === "DOMAIN";
  const needsHostingDomain = product.type === "SHARED_HOSTING";
  const freeDomainEligible = Boolean(
    selectedHostingPrice?.billingCycle.startsWith("YEAR_") && domainCheck.status === "ok" && domainCheck.priceCents <= 1500
  );
  const summary = orderSummary({
    addHosting,
    domainCheck,
    domainName: domainNameInput,
    domainProduct,
    domainUse,
    hostingDomain,
    needsDomain,
    needsHostingDomain,
    product,
    selectedHosting,
    selectedHostingPrice,
    selectedPrice,
    vatPercent
  });

  useEffect(() => {
    void getJson<{ vatPercent: number }>("/admin/dev/billing/settings")
      .then((settings) => setVatPercent(settings.vatPercent ?? 0))
      .catch(() => setVatPercent(0));
  }, []);

  useEffect(() => {
    if (initialDomain) {
      void checkDomain(initialDomain);
    }
  }, [initialDomain]);

  async function submit(formData: FormData) {
    if (!selectedPrice) {
      setState({ status: "error", message: "Kein Preis fuer dieses Produkt gefunden." });
      return;
    }
    const submittedPassword = String(formData.get("password") ?? "");
    if (!isStrongPassword(submittedPassword)) {
      setState({ status: "error", message: "Passwort erfuellt die Regeln nicht." });
      return;
    }

    setState({ status: "loading", message: "Bestellung wird erstellt..." });
    const domainName = String(formData.get("domainName") ?? "").trim().toLowerCase();
    const hostingDomainName = String(formData.get("hostingDomainName") ?? domainName).trim().toLowerCase();
    const phone = `${String(formData.get("phoneCountryCode") ?? "").trim()} ${String(formData.get("phone") ?? "").trim()}`.trim();
    const items: CheckoutItem[] = [
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
          : {
              domainName: hostingDomainName,
              domainUse,
              virtualminPlan: product.configs?.find((config) => config.key === "virtualmin_plan")?.values?.[0],
              virtualminTemplate: product.configs?.find((config) => config.key === "virtualmin_template")?.values?.[0]
            },
        domainName: needsDomain ? domainName : undefined,
        productId: product.id,
        productPriceId: selectedPrice.id,
        quantity: 1
      }
    ];

    if (needsDomain && addHosting && selectedHosting && selectedHostingPrice) {
      items.push({
        configuration: {
          domainName,
          bundledDomain: true,
          virtualminPlan: selectedHosting.configs?.find((config) => config.key === "virtualmin_plan")?.values?.[0],
          virtualminTemplate: selectedHosting.configs?.find((config) => config.key === "virtualmin_template")?.values?.[0]
        },
        domainName: undefined,
        productId: selectedHosting.id,
        productPriceId: selectedHostingPrice.id,
        quantity: 1
      });
    }

    if (needsHostingDomain && domainProduct && domainUse !== "external" && hostingDomainName) {
      items.push({
        configuration: {
          domainAction: domainUse,
          transferAuthCode: String(formData.get("hostingTransferAuthCode") ?? "")
        },
        domainName: hostingDomainName,
        productId: domainProduct.id,
        productPriceId: domainProduct.prices[0]?.id ?? "",
        quantity: 1
      });
    }

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
        password: submittedPassword,
        phone,
        vatId: String(formData.get("vatId") ?? "")
      },
      items
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
        message: "Bezahlt. Weiterleitung ins Kundenportal...",
        orderId: checkoutResponse.order.id
      });
      window.location.assign(`/client?order=${checkoutResponse.order.id}`);
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Bestellung fehlgeschlagen." });
    }
  }

  async function checkDomain(domain: string) {
    const clean = domain.trim().toLowerCase();
    if (!clean) {
      setDomainCheck({ status: "error", message: "Domain fehlt." });
      return;
    }
    setDomainCheck({ status: "loading" });
    try {
      const result = await getJson<{ action: "register" | "transfer"; available: boolean; domain: string; price: { amountCents: number } }>(
        `/domains/search?domain=${encodeURIComponent(clean)}`
      );
      setDomainUse(result.available ? "register" : "transfer");
      setDomainAction(result.available ? "register" : "transfer");
      setDomainCheck({
        status: "ok",
        action: result.available ? "register" : "transfer",
        available: result.available,
        domain: result.domain,
        priceCents: result.price.amountCents
      });
    } catch (error) {
      setDomainCheck({ status: "error", message: error instanceof Error ? error.message : "Domainpruefung fehlgeschlagen." });
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.summary}>
        <span className="eyebrow">Checkout</span>
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <div className={styles.orderSummary}>
          {summary.lines.map((line) => (
            <div className={styles.summaryLine} key={line.label}>
              <span>{line.label}</span>
              <strong>{money(line.amountCents)}</strong>
            </div>
          ))}
          {summary.vatCents > 0 ? (
            <div className={styles.summaryLine}>
              <span>VAT {vatPercent}%</span>
              <strong>{money(summary.vatCents)}</strong>
            </div>
          ) : null}
          <div className={styles.summaryTotal}>
            <span>Total</span>
            <strong>{money(summary.totalCents)}</strong>
          </div>
        </div>
      </section>

      <form action={submit} className={styles.form}>
        <label>
          Abrechnung
          <select value={priceId} onChange={(event) => setPriceId(event.target.value)}>
            {product.prices.map((price) => (
              <option key={price.id} value={price.id}>
                {cycleLabel(price.billingCycle)}
                {product.type === "DOMAIN" ? "" : ` - ${money(price.amountCents, price.currency)}`}
              </option>
            ))}
          </select>
        </label>

        {needsDomain ? (
          <>
            <label>
              Domain
              <input
                name="domainName"
                onBlur={() => checkDomain(domainNameInput)}
                onChange={(event) => {
                  setDomainNameInput(event.target.value);
                  setDomainCheck({ status: "idle" });
                }}
                placeholder="example.de"
                required
                value={domainNameInput}
              />
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

        {needsHostingDomain ? (
          <section className={styles.domainPanel}>
            <h2>Domain fuer Hosting</h2>
            <label>
              Domain
              <input
                name="hostingDomainName"
                onChange={(event) => setHostingDomain(event.target.value)}
                placeholder="example.de"
                required
                value={hostingDomain}
              />
            </label>
            <Button type="button" variant="secondary" onClick={() => checkDomain(hostingDomain)}>
              Domain pruefen
            </Button>
            {domainCheck.status === "loading" ? <p className={styles.message}>Pruefe Domain...</p> : null}
            {domainCheck.status === "ok" && domainCheck.available ? (
              <p className={styles.available}>Hurray, {domainCheck.domain} ist frei und kann zur Bestellung hinzugefuegt werden.</p>
            ) : null}
            {domainCheck.status === "ok" && !domainCheck.available ? (
              <div className={styles.choiceGrid}>
                <p className={styles.unavailable}>{domainCheck.domain} ist nicht frei.</p>
                <label>
                  <input checked={domainUse === "transfer"} onChange={() => setDomainUse("transfer")} type="radio" />
                  Transfer the domain to Dezhost
                </label>
                <label>
                  <input checked={domainUse === "external"} onChange={() => setDomainUse("external")} type="radio" />
                  Use the domain for this hosting registered somewhere else
                </label>
              </div>
            ) : null}
            {domainUse === "transfer" ? (
              <label>
                Auth-Code
                <input name="hostingTransferAuthCode" />
              </label>
            ) : null}
            {freeDomainEligible ? <p className={styles.available}>Diese Domain ist mit dieser Jahreslaufzeit kostenlos.</p> : null}
            {domainCheck.status === "ok" && selectedPrice?.billingCycle.startsWith("YEAR_") && domainCheck.priceCents > 1500 ? (
              <p className={styles.unavailable}>Diese Domain kostet mehr als 15 EUR und ist nicht kostenlos in der Jahreslaufzeit enthalten.</p>
            ) : null}
          </section>
        ) : null}

        {needsDomain && hostingProducts.length > 0 && showHostingOffer ? (
          <div className={styles.modalBackdrop}>
            <section className={styles.hostingModal}>
              <h2>Website braucht Hosting</h2>
              <p>Eine Domain allein zeigt noch keine Website. Du kannst optional direkt ein Hosting-Paket dazubuchen.</p>
              <label>
                Hosting Paket
                <select
                  value={selectedHostingId}
                  onChange={(event) => {
                    const next = hostingProducts.find((item) => item.id === event.target.value);
                    setSelectedHostingId(event.target.value);
                    setSelectedHostingPriceId(next?.prices[0]?.id ?? "");
                  }}
                >
                  {hostingProducts.map((hosting) => (
                    <option key={hosting.id} value={hosting.id}>
                      {hosting.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Laufzeit
                <select value={selectedHostingPriceId} onChange={(event) => setSelectedHostingPriceId(event.target.value)}>
                  {selectedHosting?.prices.map((price) => (
                    <option key={price.id} value={price.id}>
                      {cycleLabel(price.billingCycle)} - {money(price.amountCents, price.currency)}
                    </option>
                  ))}
                </select>
              </label>
              {selectedHostingPrice?.billingCycle.startsWith("YEAR_") ? (
                <p className={styles.available}>Jahreslaufzeiten enthalten eine kostenlose Domain bis 15 EUR.</p>
              ) : null}
              <div className={styles.modalActions}>
                <Button type="button" onClick={() => {
                  setAddHosting(true);
                  setShowHostingOffer(false);
                }}>
                  Hosting hinzufuegen
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowHostingOffer(false)}>
                  Nur Domain
                </Button>
              </div>
            </section>
          </div>
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
            <div className={styles.passwordControl}>
              <input
                maxLength={16}
                minLength={9}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <button className={styles.generateButton} onClick={() => setPassword(generatePassword())} type="button">
                Generieren
              </button>
            </div>
            <PasswordRules password={password} />
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

function PasswordRules({ password }: { password: string }) {
  const rules = [
    { label: "9-16 Zeichen", passed: password.length >= 9 && password.length <= 16 },
    { label: "Grossbuchstaben", passed: /[A-Z]/.test(password) },
    { label: "Kleinbuchstaben", passed: /[a-z]/.test(password) },
    { label: "Zahlen", passed: /\d/.test(password) },
    { label: "Sonderzeichen", passed: /[~*!@$#%_+.?:,{}]/.test(password) }
  ];

  return (
    <div className={styles.passwordRules}>
      {rules.map((rule) => (
        <span className={rule.passed ? styles.rulePassed : styles.ruleMissing} key={rule.label}>
          {rule.label}
        </span>
      ))}
    </div>
  );
}

function generatePassword() {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const specials = "~*!@$#%_+.?:,{}";
  const all = `${uppercase}${lowercase}${numbers}${specials}`;
  const chars = [
    pick(uppercase),
    pick(lowercase),
    pick(numbers),
    pick(specials),
    ...Array.from({ length: 8 }, () => pick(all))
  ];

  return shuffle(chars).join("");
}

function pick(source: string) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return source[(array[0] ?? 0) % source.length] ?? source[0] ?? "A";
}

function shuffle(values: string[]) {
  return values
    .map((value) => {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return { sort: array[0] ?? 0, value };
    })
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.value);
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

function orderSummary(input: {
  addHosting: boolean;
  domainCheck: DomainCheck;
  domainName: string;
  domainProduct?: ApiProduct;
  domainUse: "external" | "register" | "transfer";
  hostingDomain: string;
  needsDomain: boolean;
  needsHostingDomain: boolean;
  product: ApiProduct;
  selectedHosting?: ApiProduct;
  selectedHostingPrice?: ApiProduct["prices"][number];
  selectedPrice?: ApiProduct["prices"][number];
  vatPercent: number;
}) {
  const lines: Array<{ amountCents: number; label: string }> = [];

  if (input.needsDomain) {
    const domainPrice =
      input.domainCheck.status === "ok"
        ? input.domainCheck.priceCents
        : input.product.minimumPriceCents ?? input.selectedPrice?.amountCents ?? 0;
    lines.push({
      amountCents: domainPrice,
      label: `${input.domainName || "Domain"} ${input.domainCheck.status === "ok" ? input.domainCheck.action : "registration"}`
    });
    if (input.addHosting && input.selectedHosting && input.selectedHostingPrice) {
      lines.push({
        amountCents: input.selectedHostingPrice.amountCents,
        label: `${input.selectedHosting.name} ${cycleLabel(input.selectedHostingPrice.billingCycle)}`
      });
    }
  } else {
    lines.push({
      amountCents: input.selectedPrice?.amountCents ?? 0,
      label: `${input.product.name} ${cycleLabel(input.selectedPrice?.billingCycle ?? "")}`
    });
    if (input.needsHostingDomain && input.domainUse !== "external" && input.domainProduct) {
      const domainPrice = input.domainCheck.status === "ok" ? input.domainCheck.priceCents : input.domainProduct.minimumPriceCents ?? 0;
      const free = input.selectedPrice?.billingCycle.startsWith("YEAR_") && domainPrice <= 1500;
      lines.push({
        amountCents: free ? 0 : domainPrice,
        label: `${input.hostingDomain || "Domain"} ${input.domainUse}${free ? " (free)" : ""}`
      });
    }
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const vatCents = Math.round(subtotalCents * (input.vatPercent / 100));

  return {
    lines,
    subtotalCents,
    totalCents: subtotalCents + vatCents,
    vatCents
  };
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "API request failed");
  }

  return payload as T;
}
