"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, authHeaders, cycleLabel, money, storeAuth, type ApiPaymentGateway, type ApiProduct, type AuthPayload } from "../../lib/api";
import { countriesForLocale } from "../../lib/countries";
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

type ClientProfile = {
  address?: { city?: string; line1?: string; postalCode?: string; state?: string };
  countryCode?: string;
  customerType?: string;
  email: string;
  id: string;
  name: string;
  phone?: string;
  vatId?: string;
};

export function CheckoutForm({
  domainProduct,
  hostingProducts = [],
  initialDomain = "",
  initialDomainAction = "register",
  locale,
  product
}: CheckoutFormProps) {
  const selectablePrices = useMemo(
    () => (product.type === "DOMAIN" ? product.prices.filter((price) => price.billingCycle.startsWith("YEAR_")) : product.prices),
    [product.prices, product.type]
  );
  const [priceId, setPriceId] = useState(selectablePrices[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [domainUse, setDomainUse] = useState<"register" | "transfer" | "external">(initialDomainAction);
  const [password, setPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggedInPassword, setLoggedInPassword] = useState("");
  const [profile, setProfile] = useState<ClientProfile>();
  const [loginOpen, setLoginOpen] = useState(false);
  const [showHostingOffer, setShowHostingOffer] = useState(false);
  const [addHosting, setAddHosting] = useState(false);
  const [showNameServers, setShowNameServers] = useState(false);
  const [domainNameInput, setDomainNameInput] = useState(initialDomain);
  const [hostingDomain, setHostingDomain] = useState(initialDomain);
  const [selectedHostingId, setSelectedHostingId] = useState(hostingProducts[0]?.id ?? "");
  const [selectedHostingPriceId, setSelectedHostingPriceId] = useState(hostingProducts[0]?.prices[0]?.id ?? "");
  const [phoneCountryCode, setPhoneCountryCode] = useState(splitProfilePhone().countryCode);
  const [paymentGateways, setPaymentGateways] = useState<ApiPaymentGateway[]>(defaultPaymentGateways);
  const [domainCheck, setDomainCheck] = useState<DomainCheck>({ status: "idle" });
  const [vatPercent, setVatPercent] = useState(0);
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const selectedPrice = useMemo(
    () => selectablePrices.find((price) => price.id === priceId) ?? selectablePrices[0],
    [priceId, selectablePrices]
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
  const countries = useMemo(() => countriesForLocale(locale), [locale]);
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
    void Promise.all([
      getJson<{ vatPercent: number }>("/storefront/settings")
        .then((settings) => setVatPercent(settings.vatPercent ?? 0))
        .catch(() => setVatPercent(0)),
      getJson<ApiPaymentGateway[]>("/storefront/payment-gateways")
        .then((gateways) => {
          const next = gateways.length ? gateways : defaultPaymentGateways;
          setPaymentGateways(next);
          setPaymentMethod(next[0]?.method ?? "CREDIT_CARD");
        })
        .catch(() => undefined)
    ]);
  }, []);

  useEffect(() => {
    if (!selectablePrices.some((price) => price.id === priceId)) {
      setPriceId(selectablePrices[0]?.id ?? "");
    }
  }, [priceId, selectablePrices]);

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
    const submittedPassword = loggedInPassword || String(formData.get("password") ?? "");
    if (!profile && !isStrongPassword(submittedPassword)) {
      setState({ status: "error", message: "Passwort erfuellt die Regeln nicht." });
      return;
    }

    setState({ status: "loading", message: "Bestellung wird erstellt..." });
    const domainName = String(formData.get("domainName") ?? "").trim().toLowerCase();
    const hostingDomainName = String(formData.get("hostingDomainName") ?? domainName).trim().toLowerCase();
    const phone = `${String(formData.get("phoneCountryCode") ?? "").trim()} ${String(formData.get("phone") ?? "").trim()}`.trim();
    const resolvedDomainAction = domainCheck.status === "ok" ? domainCheck.action : initialDomainAction;
    const items: CheckoutItem[] = [
      {
        configuration: needsDomain
          ? {
              billingCycle: selectedPrice.billingCycle,
              domainAction: resolvedDomainAction,
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

    const resolvedHostingDomainUse = hostingDomainUse(domainUse, domainCheck, hostingDomainName);
    if (needsHostingDomain && domainProduct && resolvedHostingDomainUse !== "external" && hostingDomainName) {
      const domainPrice = yearlyPrice(domainProduct);
      items.push({
        configuration: {
          domainAction: resolvedHostingDomainUse,
          transferAuthCode: String(formData.get("hostingTransferAuthCode") ?? "")
        },
        domainName: hostingDomainName,
        productId: domainProduct.id,
        productPriceId: domainPrice?.id ?? "",
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
      const auth = await postJson<AuthPayload>("/auth/login", {
        email: body.customer.email,
        password: submittedPassword
      });
      storeAuth(auth);
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

  async function loginClient() {
    setState({ status: "loading", message: "Login laeuft..." });
    try {
      const auth = await postJson<AuthPayload>("/auth/login", { email: loginEmail, password: loginPassword });
      storeAuth(auth);
      const me = await getJson<ClientProfile>("/users/me", auth.accessToken);
      setProfile(me);
      setLoggedInPassword(loginPassword);
      setPhoneCountryCode(splitProfilePhone(me.phone).countryCode);
      setPassword("");
      setLoginOpen(false);
      setState({ status: "idle" });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Login fehlgeschlagen." });
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.summary}>
        <span className="eyebrow">Checkout</span>
        <h1>Order details</h1>
        <div className={styles.orderSummary}>
          {summary.lines.map((line) => (
            <div className={styles.summaryLine} key={line.id}>
              <span>{line.label}{line.detail ? <small>{line.detail}</small> : null}</span>
              <div className={styles.cartControls}>
                <strong>{money(line.amountCents)}</strong>
                {line.kind === "domain" ? (
                  <button type="button" onClick={() => focusByName(needsDomain ? "domainName" : "hostingDomainName")} title="Domain bearbeiten">
                    edit
                  </button>
                ) : null}
                {line.kind === "hostingAddon" ? (
                  <button type="button" onClick={() => setShowHostingOffer(true)} title="Hosting bearbeiten">
                    edit
                  </button>
                ) : null}
                {line.removable ? (
                  <button
                    aria-label={`${line.label} entfernen`}
                    type="button"
                    onClick={() => {
                      if (line.kind === "hostingAddon") {
                        setAddHosting(false);
                      }
                      if (line.kind === "domainAddon") {
                        setDomainUse("external");
                      }
                    }}
                  >
                    -
                  </button>
                ) : null}
              </div>
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
        {needsDomain && hostingProducts.length > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setShowHostingOffer(true)}>
            Add hosting
          </Button>
        ) : null}
      </section>

      <form action={submit} className={styles.form}>
        <section className={styles.loginPanel}>
          {profile ? (
            <p className={styles.message}>Eingeloggt als {profile.email}</p>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => setLoginOpen(!loginOpen)}>
                Kundenlogin
              </Button>
              {loginOpen ? (
                <div className={styles.loginGrid}>
                  <label>
                    E-Mail
                    <input name="loginEmail" onChange={(event) => setLoginEmail(event.target.value)} type="email" value={loginEmail} />
                  </label>
                  <label>
                    Passwort
                    <input name="loginPassword" onChange={(event) => setLoginPassword(event.target.value)} type="password" value={loginPassword} />
                  </label>
                  <Button type="button" onClick={loginClient}>
                    Einloggen
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <label>
          Abrechnung
          <select value={priceId} onChange={(event) => setPriceId(event.target.value)}>
            {selectablePrices.map((price) => (
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
            {domainCheck.status === "ok" ? (
              <p className={domainCheck.available ? styles.available : styles.unavailable}>
                {domainCheck.domain} wird {domainCheck.action === "register" ? "registriert" : "transferiert"}.
              </p>
            ) : null}
            {(domainCheck.status === "ok" ? domainCheck.action : initialDomainAction) === "transfer" ? (
              <label>
                Auth-Code *
                <input name="transferAuthCode" required />
              </label>
            ) : null}
            {showNameServers ? (
              <label>
                Name servers
                <input name="nameServers" placeholder="ns1.dezhost.test, ns2.dezhost.test" />
                <button className={styles.linkButton} type="button" onClick={() => setShowNameServers(false)}>
                  Hide custom name servers
                </button>
              </label>
            ) : (
              <button className={styles.linkButton} type="button" onClick={() => setShowNameServers(true)}>
                Add custom name servers
              </button>
            )}
          </>
        ) : null}

        {needsHostingDomain ? (
          <section className={styles.domainPanel}>
            <h2>Domain fuer Hosting</h2>
            <label>
              Domain
              <input
                name="hostingDomainName"
                onChange={(event) => {
                  setHostingDomain(event.target.value);
                  setDomainCheck({ status: "idle" });
                }}
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
                Auth-Code *
                <input name="hostingTransferAuthCode" required />
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
              <div className={styles.hostingCards}>
                {hostingProducts.map((hosting) => (
                  <label className={selectedHostingId === hosting.id ? styles.hostingCardSelected : styles.hostingCard} key={hosting.id}>
                    <input
                      checked={selectedHostingId === hosting.id}
                      name="hostingPackage"
                      onChange={() => {
                        setSelectedHostingId(hosting.id);
                        setSelectedHostingPriceId(hosting.prices[0]?.id ?? "");
                      }}
                      type="radio"
                    />
                    <strong>{hosting.name}</strong>
                    <span>{hosting.description}</span>
                    <ul>
                      {productHighlights(hosting).map((highlight) => <li key={highlight}>{highlight}</li>)}
                    </ul>
                    <select
                      value={selectedHostingId === hosting.id ? selectedHostingPriceId : hosting.prices[0]?.id ?? ""}
                      onChange={(event) => {
                        setSelectedHostingId(hosting.id);
                        setSelectedHostingPriceId(event.target.value);
                      }}
                    >
                      {hosting.prices.map((price) => (
                        <option key={price.id} value={price.id}>
                          {cycleLabel(price.billingCycle)} - {money(price.amountCents, price.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
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

        <div className={styles.grid} key={profile?.id ?? "guest"}>
          <label>
            Name *
            <input defaultValue={profile?.name ?? ""} name="name" required />
          </label>
          <label>
            E-Mail *
            <input defaultValue={profile?.email ?? ""} name="email" required type="email" />
          </label>
          {!profile ? (
            <label>
              Passwort *
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
          ) : null}
          <label>
            Organization
            <input name="companyName" />
          </label>
          <label>
            USt-Id optional
            <input defaultValue={profile?.vatId ?? ""} name="vatId" />
          </label>
          <label>
            Adresse *
            <input defaultValue={profileAddress(profile).line1} name="address" required />
          </label>
          <label>
            PLZ *
            <input defaultValue={profileAddress(profile).postalCode} name="postalCode" required />
          </label>
          <label>
            Stadt *
            <input defaultValue={profileAddress(profile).city} name="city" required />
          </label>
          <label>
            Land *
            <select
              defaultValue={profile?.countryCode ?? "DE"}
              name="countryCode"
              onChange={(event) => {
                const country = countries.find((item) => item.code === event.target.value);
                if (country) {
                  setPhoneCountryCode(country.phone);
                }
              }}
              required
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bundesland *
            <input defaultValue={profileAddress(profile).state} name="state" required />
          </label>
          <label>
            Telefon *
            <div className={styles.phoneField}>
              <input
                aria-label="Country calling code"
                name="phoneCountryCode"
                onChange={(event) => setPhoneCountryCode(event.target.value)}
                required
                value={phoneCountryCode}
              />
              <input defaultValue={splitProfilePhone(profile?.phone).number} name="phone" required />
            </div>
          </label>
        </div>

        <fieldset className={styles.paymentMethods}>
          Zahlung
          <div className={styles.paymentGrid}>
            {paymentGateways.map((gateway) => (
              <label className={paymentMethod === gateway.method ? styles.paymentSelected : styles.paymentCard} key={gateway.method}>
                <input
                  checked={paymentMethod === gateway.method}
                  onChange={() => setPaymentMethod(gateway.method)}
                  type="radio"
                  value={gateway.method}
                />
                <span className={styles.paymentImage}>{paymentMark(gateway.method)}</span>
                <strong>{gateway.title}</strong>
              </label>
            ))}
          </div>
        </fieldset>

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

function yearlyPrice(product: ApiProduct) {
  return product.prices.find((price) => price.billingCycle.startsWith("YEAR_")) ?? product.prices[0];
}

function focusByName(name: string) {
  const field = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  field?.focus();
}

function profileAddress(profile?: ClientProfile) {
  return {
    city: profile?.address?.city ?? "",
    line1: profile?.address?.line1 ?? "",
    postalCode: profile?.address?.postalCode ?? "",
    state: profile?.address?.state ?? ""
  };
}

function splitProfilePhone(phone?: string) {
  const clean = phone?.trim() ?? "";
  const match = clean.match(/^(\+\d{1,3})\s+(.*)$/);
  return {
    countryCode: match?.[1] ?? "+49",
    number: match?.[2] ?? clean.replace(/^\+\d{1,3}/, "").trim()
  };
}

const defaultPaymentGateways: ApiPaymentGateway[] = [
  { method: "CREDIT_CARD", title: "Credit/debit card" },
  { method: "PAYPAL", title: "Paypal" },
  { method: "SEPA", title: "SEPA Lastschrift" }
];

function paymentMark(method: string) {
  if (method === "PAYPAL") {
    return "PayPal";
  }
  if (method === "SEPA") {
    return "SEPA";
  }
  return "VISA MC";
}

function productHighlights(product: ApiProduct) {
  const highlights = (product.configs ?? [])
    .filter((config) => !config.key.startsWith("virtualmin_"))
    .map((config) => `${config.label}${config.values[0] ? `: ${String(config.values[0])}` : ""}`);
  return highlights.length ? highlights.slice(0, 4) : ["Managed hosting", "SSL ready", "Support included"];
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
  const lines: Array<{ amountCents: number; detail?: string; id: string; kind: "domain" | "domainAddon" | "hosting" | "hostingAddon"; label: string; removable?: boolean }> = [];

  if (input.needsDomain) {
    const domainPrice =
      input.domainCheck.status === "ok"
        ? input.domainCheck.priceCents
        : input.product.minimumPriceCents ?? input.selectedPrice?.amountCents ?? 0;
    lines.push({
      amountCents: domainPrice,
      id: "domain",
      kind: "domain",
      detail: `${yearsFromCycle(input.selectedPrice?.billingCycle)} year${yearsFromCycle(input.selectedPrice?.billingCycle) === 1 ? "" : "s"}`,
      label: `${input.domainName || "Domain"} ${input.domainCheck.status === "ok" ? input.domainCheck.action : "registration"}`
    });
    if (input.addHosting && input.selectedHosting && input.selectedHostingPrice) {
      lines.push({
        amountCents: input.selectedHostingPrice.amountCents,
        id: "hosting-addon",
        kind: "hostingAddon",
        detail: productDetails(input.selectedHosting),
        label: `${input.selectedHosting.name} ${cycleLabel(input.selectedHostingPrice.billingCycle)}`,
        removable: true
      });
    }
  } else {
    lines.push({
      amountCents: input.selectedPrice?.amountCents ?? 0,
      detail: productDetails(input.product),
      id: "hosting",
      kind: "hosting",
      label: `${input.product.name} ${cycleLabel(input.selectedPrice?.billingCycle ?? "")}`
    });
    const domainUse = hostingDomainUse(input.domainUse, input.domainCheck, input.hostingDomain);
    if (input.needsHostingDomain && domainUse !== "external" && input.domainProduct) {
      const domainPrice = input.domainCheck.status === "ok" ? input.domainCheck.priceCents : input.domainProduct.minimumPriceCents ?? 0;
      const free = input.selectedPrice?.billingCycle.startsWith("YEAR_") && domainPrice <= 1500;
      lines.push({
        amountCents: free ? 0 : domainPrice,
        id: "domain-addon",
        kind: "domainAddon",
        detail: `${yearsFromCycle(input.selectedPrice?.billingCycle)} year${yearsFromCycle(input.selectedPrice?.billingCycle) === 1 ? "" : "s"}`,
        label: `${input.hostingDomain || "Domain"} ${domainUse}${free ? " (free)" : ""}`,
        removable: true
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

function productDetails(product?: ApiProduct) {
  return (product?.configs ?? [])
    .filter((config) => !config.key.startsWith("virtualmin_"))
    .map((config) => `${config.label}${config.values[0] ? `: ${String(config.values[0])}` : ""}`)
    .join(" · ");
}

function yearsFromCycle(cycle?: string) {
  const match = cycle?.match(/^YEAR_(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function hostingDomainUse(domainUse: "external" | "register" | "transfer", domainCheck: DomainCheck, hostingDomain: string) {
  if (domainCheck.status === "ok" && domainCheck.available && domainCheck.domain === hostingDomain.trim().toLowerCase()) {
    return domainCheck.action;
  }

  return domainUse;
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

async function getJson<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : authHeaders()
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "API request failed");
  }

  return payload as T;
}
