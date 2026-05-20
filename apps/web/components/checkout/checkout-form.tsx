"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { API_BASE_URL, authHeaders, authToken, cycleLabel, money, storeAuth, type ApiDomainPrice, type ApiPaymentGateway, type ApiProduct, type AuthPayload } from "../../lib/api";
import { countriesForLocale } from "../../lib/countries";
import { Button } from "../ui/button";
import { notify } from "../ui/toast-provider";
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
type CountryOption = ReturnType<typeof countriesForLocale>[number];

export function CheckoutForm({
  domainProduct,
  hostingProducts = [],
  initialDomain = "",
  initialDomainAction = "register",
  locale,
  product
}: CheckoutFormProps) {
  const firstPrice = product.type === "DOMAIN"
    ? product.prices.find((price) => price.billingCycle.startsWith("YEAR_")) ?? product.prices[0]
    : product.prices[0];
  const [priceSelection, setPriceSelection] = useState(firstPrice ? priceSelectionKey(firstPrice, product.type) : "");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [domainUse, setDomainUse] = useState<"register" | "transfer" | "external">(initialDomainAction);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  const [domainPrices, setDomainPrices] = useState<ApiDomainPrice[]>([]);
  const [domainCheck, setDomainCheck] = useState<DomainCheck>({ status: "idle" });
  const [vatPercent, setVatPercent] = useState(0);
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const domainPriceAction = domainCheck.status === "ok" ? domainCheck.action : initialDomainAction;
  const selectablePrices = useMemo(
    () => (product.type === "DOMAIN" ? domainSelectablePrices(product, domainPrices, domainNameInput, domainPriceAction) : product.prices),
    [domainNameInput, domainPriceAction, domainPrices, product]
  );
  const selectedPrice = useMemo(
    () => selectablePrices.find((price) => priceSelectionKey(price, product.type) === priceSelection) ?? selectablePrices[0],
    [priceSelection, product.type, selectablePrices]
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
        .catch(() => undefined),
      getJson<ApiDomainPrice[]>("/storefront/domain-prices")
        .then((prices) => setDomainPrices(Array.isArray(prices) ? prices : []))
        .catch(() => undefined)
    ]);
  }, []);

  useEffect(() => {
    if (!authToken("client")) {
      return;
    }
    getJson<ClientProfile>("/users/me", authToken("client"))
      .then((me) => {
        setProfile(me);
        setPhoneCountryCode(splitProfilePhone(me.phone).countryCode);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectablePrices.some((price) => priceSelectionKey(price, product.type) === priceSelection)) {
      setPriceSelection(selectablePrices[0] ? priceSelectionKey(selectablePrices[0], product.type) : "");
    }
  }, [priceSelection, product.type, selectablePrices]);

  useEffect(() => {
    if (initialDomain) {
      void checkDomain(initialDomain);
    }
  }, [initialDomain]);

  async function submit(formData: FormData) {
    if (!selectedPrice) {
      const message = "Kein Preis fuer dieses Produkt gefunden.";
      setState({ status: "error", message });
      notify.error(message);
      return;
    }
    const submittedPassword = profile ? "" : loggedInPassword || String(formData.get("password") ?? "");
    if (!profile && !isStrongPassword(submittedPassword)) {
      const message = "Passwort erfuellt die Regeln nicht.";
      setState({ status: "error", message });
      notify.error(message);
      return;
    }

    setState({ status: "loading", message: "Bestellung wird erstellt..." });
    notify.info("Bestellung wird erstellt...");
    const customerEmail = profile?.email ?? String(formData.get("email") ?? "").trim().toLowerCase();
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
      const domainPrice = priceForCycle(domainProduct, selectedPrice?.billingCycle);
      items.push({
        configuration: {
          billingCycle: selectedPrice?.billingCycle,
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
      customer: profile ? profileCheckoutCustomer(profile) : {
        address: {
          city: formData.get("city"),
          line1: formData.get("address"),
          postalCode: formData.get("postalCode"),
          state: formData.get("state")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("companyName") ?? "").trim() ? "BUSINESS" : "INDIVIDUAL",
        email: customerEmail,
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
      notify.success("Bestellung erstellt.");
      setState({ status: "loading", message: "Sandbox-Zahlung laeuft..." });
      notify.info("Sandbox-Zahlung laeuft...");
      const paymentResponse = await postJson<{ invoice?: { status?: string }; paymentRedirectUrl?: string }>(`/orders/${checkoutResponse.order.id}/pay`, {
        method: paymentMethod === "SANDBOX" ? "CREDIT_CARD" : paymentMethod,
        paymentMethodId: paymentMethod === "SANDBOX" ? "sandbox" : "checkout"
      });
      const redirectUrl = paymentResponse.paymentRedirectUrl ?? (paymentResponse.invoice as { paymentRedirectUrl?: string } | undefined)?.paymentRedirectUrl;
      if (redirectUrl) {
        notify.info("Weiterleitung zum Zahlungsanbieter...");
        window.location.assign(redirectUrl);
        return;
      }
      if (!profile) {
        const auth = await postJson<AuthPayload>("/auth/login", {
          email: customerEmail,
          password: submittedPassword
        });
        storeAuth(auth);
      }
      notify.success("Zahlung erfolgreich.");
      if (items.some((item) => hostingProducts.some((hosting) => hosting.id === item.productId) || product.type === "SHARED_HOSTING")) {
        notify.info("Hosting account is being activated.");
      }
      setState({
        status: "success",
        message: "Bezahlt. Weiterleitung ins Kundenportal...",
        orderId: checkoutResponse.order.id
      });
      notify.success("Bezahlt. Weiterleitung ins Kundenportal...");
      window.location.assign(`/client?order=${checkoutResponse.order.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bestellung fehlgeschlagen.";
      setState({ status: "error", message });
      notify.error(message);
    }
  }

  async function checkDomain(domain: string) {
    const clean = domain.trim().toLowerCase();
    if (!clean) {
      const message = "Domain fehlt.";
      setDomainCheck({ status: "error", message });
      notify.error(message);
      return;
    }
    setDomainCheck({ status: "loading" });
    notify.info("Domainpruefung laeuft...");
    try {
      const years = yearsFromCycle(selectedPrice?.billingCycle);
      const result = await getJson<{ action: "register" | "transfer"; available: boolean; domain: string; price: { amountCents: number } }>(
        `/domains/search?domain=${encodeURIComponent(clean)}&years=${years}`
      );
      setDomainUse(result.available ? "register" : "transfer");
      setDomainCheck({
        status: "ok",
        action: result.available ? "register" : "transfer",
        available: result.available,
        domain: result.domain,
        priceCents: result.price.amountCents
      });
      notify.success(`${result.domain} wird ${result.available ? "registriert" : "transferiert"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Domainpruefung fehlgeschlagen.";
      setDomainCheck({ status: "error", message });
      notify.error(message);
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
      notify.success("Login erfolgreich.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login fehlgeschlagen.";
      setState({ status: "error", message });
      notify.error(message);
    }
  }

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.shell}>
        {/* ── LEFT: Order Summary ── */}
        <aside className={styles.summary}>
          <div className={styles.summaryHeader}>
            <span className={styles.summaryEyebrow}>Ihre Bestellung</span>
            <h1 className={styles.summaryTitle}>{product.name}</h1>
            {product.description ? <p className={styles.summaryDesc}>{product.description}</p> : null}
          </div>

          <div className={styles.billingCycleRow}>
            <label className={styles.fieldLabel}>
              Abrechnungszeitraum
              <select
                className={styles.cycleSelect}
                value={priceSelection}
                onChange={(event) => {
                  setPriceSelection(event.target.value);
                  if (domainCheck.status === "ok") {
                    setDomainCheck({ status: "idle" });
                  }
                }}
              >
                {selectablePrices.map((price) => (
                  <option key={priceSelectionKey(price, product.type)} value={priceSelectionKey(price, product.type)}>
                    {cycleLabel(price.billingCycle)}
                    {product.type === "DOMAIN" && price.amountCents > 0 ? ` — ${money(price.amountCents, price.currency)}` : ""}
                    {product.type === "DOMAIN" ? "" : ` — ${money(price.amountCents, price.currency)}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.orderSummary}>
            <p className={styles.summarySubheading}>Zusammenfassung</p>
            {summary.lines.map((line) => (
              <div className={styles.summaryLine} key={line.id}>
                <div className={styles.summaryLineInfo}>
                  <span className={styles.summaryLineName}>{line.label}</span>
                  {line.detail ? <small className={styles.summaryLineDetail}>{line.detail}</small> : null}
                </div>
                <div className={styles.cartControls}>
                  <strong className={styles.summaryLinePrice}>{money(line.amountCents)}</strong>
                  {line.kind === "domain" ? (
                    <button
                      className={styles.iconButton}
                      type="button"
                      onClick={() => focusByName(needsDomain ? "domainName" : "hostingDomainName")}
                      title="Domain bearbeiten"
                    >
                      ✎
                    </button>
                  ) : null}
                  {line.kind === "hostingAddon" ? (
                    <button className={styles.iconButton} type="button" onClick={() => setShowHostingOffer(true)} title="Hosting bearbeiten">
                      ✎
                    </button>
                  ) : null}
                  {line.removable ? (
                    <button
                      className={styles.removeButton}
                      aria-label={`${line.label} entfernen`}
                      type="button"
                      onClick={() => {
                        if (line.kind === "hostingAddon") setAddHosting(false);
                        if (line.kind === "domainAddon") setDomainUse("external");
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

            {summary.vatCents > 0 ? (
              <div className={styles.summaryVat}>
                <span>MwSt. {vatPercent}%</span>
                <span>{money(summary.vatCents)}</span>
              </div>
            ) : null}

            <div className={styles.summaryTotal}>
              <span>Gesamtbetrag</span>
              <strong>{money(summary.totalCents)}</strong>
            </div>
          </div>

          {needsDomain && hostingProducts.length > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setShowHostingOffer(true)}>
              + Hosting hinzufügen
            </Button>
          ) : null}
        </aside>

        {/* ── RIGHT: Checkout Form ── */}
        <form action={submit} className={styles.form}>

          {/* Existing customer login */}
          <div className={styles.loginPanel}>
            {profile ? (
              <div className={styles.loggedInBadge}>
                <span className={styles.loggedInIcon}>✓</span>
                <span>Eingeloggt als <strong>{profile.email}</strong></span>
              </div>
            ) : (
              <>
                <div className={styles.loginToggleRow}>
                  <span className={styles.loginHint}>Bereits Kunde?</span>
                  <button className={styles.linkButton} type="button" onClick={() => setLoginOpen(!loginOpen)}>
                    {loginOpen ? "Abbrechen" : "Einloggen"}
                  </button>
                </div>
                {loginOpen ? (
                  <div className={styles.loginGrid}>
                    <label className={styles.fieldLabel}>
                      E-Mail
                      <input className={styles.input} name="loginEmail" onChange={(event) => setLoginEmail(event.target.value)} type="email" value={loginEmail} />
                    </label>
                    <label className={styles.fieldLabel}>
                      Passwort
                      <input className={styles.input} name="loginPassword" onChange={(event) => setLoginPassword(event.target.value)} type="password" value={loginPassword} />
                    </label>
                    <Button type="button" onClick={loginClient}>
                      Einloggen
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Domain section */}
          {needsDomain ? (
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>Domain</p>
              <label className={styles.fieldLabel}>
                <span>Domain-Name <span className={styles.required}>*</span></span>
                <input
                  className={styles.input}
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
              {domainCheck.status === "loading" ? <p className={styles.statusMsg}>Prüfe Domain…</p> : null}
              {domainCheck.status === "ok" ? (
                <p className={domainCheck.available ? styles.available : styles.unavailable}>
                  {domainCheck.available ? "✓" : "✕"} {domainCheck.domain} wird {domainCheck.action === "register" ? "registriert" : "transferiert"}.
                </p>
              ) : null}
              {(domainCheck.status === "ok" ? domainCheck.action : initialDomainAction) === "transfer" ? (
                <label className={styles.fieldLabel}>
                  <span>Auth-Code <span className={styles.required}>*</span></span>
                  <input className={styles.input} name="transferAuthCode" required />
                </label>
              ) : null}
              {showNameServers ? (
                <label className={styles.fieldLabel}>
                  Name-Server
                  <input className={styles.input} name="nameServers" placeholder="ns1.dezhost.test, ns2.dezhost.test" />
                  <button className={styles.linkButton} type="button" onClick={() => setShowNameServers(false)}>
                    Eigene Name-Server ausblenden
                  </button>
                </label>
              ) : (
                <button className={styles.linkButton} type="button" onClick={() => setShowNameServers(true)}>
                  + Eigene Name-Server hinzufügen
                </button>
              )}
            </div>
          ) : null}

          {/* Hosting domain section */}
          {needsHostingDomain ? (
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>Domain für Hosting</p>
              <label className={styles.fieldLabel}>
                <span>Domain <span className={styles.required}>*</span></span>
                <input
                  className={styles.input}
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
                Domain prüfen
              </Button>
              {domainCheck.status === "loading" ? <p className={styles.statusMsg}>Prüfe Domain…</p> : null}
              {domainCheck.status === "ok" && domainCheck.available ? (
                <p className={styles.available}>✓ {domainCheck.domain} ist verfügbar und kann zur Bestellung hinzugefügt werden.</p>
              ) : null}
              {domainCheck.status === "ok" && !domainCheck.available ? (
                <div className={styles.choiceGrid}>
                  <p className={styles.unavailable}>✕ {domainCheck.domain} ist nicht verfügbar.</p>
                  <label className={styles.radioLabel}>
                    <input checked={domainUse === "transfer"} onChange={() => setDomainUse("transfer")} type="radio" />
                    Domain zu Dezhost transferieren
                  </label>
                  <label className={styles.radioLabel}>
                    <input checked={domainUse === "external"} onChange={() => setDomainUse("external")} type="radio" />
                    Domain extern belassen
                  </label>
                </div>
              ) : null}
              {domainUse === "transfer" ? (
                <label className={styles.fieldLabel}>
                  <span>Auth-Code <span className={styles.required}>*</span></span>
                  <input className={styles.input} name="hostingTransferAuthCode" required />
                </label>
              ) : null}
              {freeDomainEligible ? <p className={styles.available}>✓ Diese Domain ist bei Jahreslaufzeit kostenlos enthalten.</p> : null}
              {domainCheck.status === "ok" && selectedPrice?.billingCycle.startsWith("YEAR_") && domainCheck.priceCents > 1500 ? (
                <p className={styles.unavailable}>Diese Domain kostet mehr als 15 EUR und ist nicht kostenlos enthalten.</p>
              ) : null}
            </div>
          ) : null}

          {/* Hosting upsell modal */}
          {needsDomain && hostingProducts.length > 0 && showHostingOffer ? (
            <div className={styles.modalBackdrop}>
              <section className={styles.hostingModal}>
                <div className={styles.modalHeader}>
                  <h2 className={styles.modalTitle}>Hosting hinzufügen</h2>
                  <button className={styles.modalClose} type="button" onClick={() => setShowHostingOffer(false)} aria-label="Schließen">✕</button>
                </div>
                <p className={styles.modalDesc}>Eine Domain allein zeigt noch keine Website. Buche direkt ein passendes Hosting-Paket dazu.</p>
                <div className={styles.hostingCards}>
                  {hostingProducts.map((hosting) => (
                    <label className={selectedHostingId === hosting.id ? styles.hostingCardSelected : styles.hostingCard} key={hosting.id}>
                      <div className={styles.hostingCardTop}>
                        <input
                          checked={selectedHostingId === hosting.id}
                          name="hostingPackage"
                          onChange={() => {
                            setSelectedHostingId(hosting.id);
                            setSelectedHostingPriceId(hosting.prices[0]?.id ?? "");
                          }}
                          type="radio"
                        />
                        <strong className={styles.hostingCardName}>{hosting.name}</strong>
                      </div>
                      <span className={styles.hostingCardDesc}>{hosting.description}</span>
                      <ul className={styles.hostingCardFeatures}>
                        {productHighlights(hosting).map((highlight) => <li key={highlight}>{highlight}</li>)}
                      </ul>
                      <select
                        className={styles.hostingCycleSelect}
                        value={selectedHostingId === hosting.id ? selectedHostingPriceId : hosting.prices[0]?.id ?? ""}
                        onChange={(event) => {
                          setSelectedHostingId(hosting.id);
                          setSelectedHostingPriceId(event.target.value);
                        }}
                      >
                        {hosting.prices.map((price) => (
                          <option key={price.id} value={price.id}>
                            {cycleLabel(price.billingCycle)} — {money(price.amountCents, price.currency)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {selectedHostingPrice?.billingCycle.startsWith("YEAR_") ? (
                  <p className={styles.available}>✓ Jahreslaufzeiten enthalten eine kostenlose Domain bis 15 EUR.</p>
                ) : null}
                <div className={styles.modalActions}>
                  <Button type="button" onClick={() => { setAddHosting(true); setShowHostingOffer(false); notify.info("Hosting wurde zur Bestellung hinzugefuegt."); }}>
                    Hosting hinzufügen
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowHostingOffer(false)}>
                    Nur Domain
                  </Button>
                </div>
              </section>
            </div>
          ) : null}

          {!profile ? <ContactFields
            countries={countries}
            password={password}
            phoneCountryCode={phoneCountryCode}
            setPassword={setPassword}
            setPhoneCountryCode={setPhoneCountryCode}
            setShowPassword={setShowPassword}
            showPassword={showPassword}
          /> : null}

          {/* Payment */}
          <div className={styles.formSection}>
            <p className={styles.sectionLabel}>Zahlungsmethode</p>
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
                  <strong className={styles.paymentLabel}>{gateway.title}</strong>
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className={styles.submitRow}>
            <Button type="submit">Kostenpflichtig bestellen</Button>
            {state.status !== "idle" ? (
              <p className={`${styles.statusMsg} ${styles[state.status]}`}>
                {state.message}
                {state.status === "success" ? (
                  <> <a href={`/client?order=${state.orderId}`} className={styles.portalLink}>Zum Portal →</a></>
                ) : null}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordRules({ password }: { password: string }) {
  const rules = [
    { label: "9–16 Zeichen", passed: password.length >= 9 && password.length <= 16 },
    { label: "Großbuchstaben", passed: /[A-Z]/.test(password) },
    { label: "Kleinbuchstaben", passed: /[a-z]/.test(password) },
    { label: "Zahlen", passed: /\d/.test(password) },
    { label: "Sonderzeichen", passed: /[~*!@$#%_+.?:,{}]/.test(password) }
  ];

  return (
    <div className={styles.passwordRules}>
      {rules.map((rule) => (
        <span className={rule.passed ? styles.rulePassed : styles.ruleMissing} key={rule.label}>
          {rule.passed ? "✓" : "○"} {rule.label}
        </span>
      ))}
    </div>
  );
}

function ContactFields({
  countries,
  password,
  phoneCountryCode,
  setPassword,
  setPhoneCountryCode,
  setShowPassword,
  showPassword
}: {
  countries: CountryOption[];
  password: string;
  phoneCountryCode: string;
  setPassword: (password: string) => void;
  setPhoneCountryCode: (code: string) => void;
  setShowPassword: (show: boolean) => void;
  showPassword: boolean;
}) {
  return (
    <>
      <div className={styles.formSection}>
        <p className={styles.sectionLabel}>Persönliche Daten</p>
        <div className={styles.grid}>
          <label className={styles.fieldLabel}>
            <span>Name <span className={styles.required}>*</span></span>
            <input className={styles.input} name="name" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>E-Mail <span className={styles.required}>*</span></span>
            <input className={styles.input} name="email" required type="email" />
          </label>
          <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
            <span>Passwort <span className={styles.required}>*</span></span>
            <div className={styles.passwordControl}>
              <div className={styles.passwordInputWrap}>
                <input
                  className={styles.input}
                  maxLength={16}
                  minLength={9}
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Passwort verstecken" : "Passwort anzeigen"}
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
                </button>
              </div>
              <button className={styles.generateButton} onClick={() => setPassword(generatePassword())} type="button">
                Generieren
              </button>
            </div>
            <PasswordRules password={password} />
          </label>
          <label className={styles.fieldLabel}>
            <span>Telefon <span className={styles.required}>*</span></span>
            <div className={styles.phoneField}>
              <input
                className={styles.input}
                aria-label="Ländervorwahl"
                name="phoneCountryCode"
                onChange={(event) => setPhoneCountryCode(event.target.value)}
                required
                value={phoneCountryCode}
              />
              <input className={styles.input} name="phone" required />
            </div>
          </label>
        </div>
      </div>
      <div className={styles.formSection}>
        <p className={styles.sectionLabel}>Unternehmen <span className={styles.optionalBadge}>optional</span></p>
        <div className={styles.grid}>
          <label className={styles.fieldLabel}>
            Firmenname
            <input className={styles.input} name="companyName" placeholder="Nur für Geschäftskunden" />
          </label>
          <label className={styles.fieldLabel}>
            USt-Id
            <input className={styles.input} name="vatId" placeholder="DE123456789" />
          </label>
        </div>
      </div>
      <div className={styles.formSection}>
        <p className={styles.sectionLabel}>Adresse</p>
        <div className={styles.grid}>
          <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
            <span>Straße & Hausnummer <span className={styles.required}>*</span></span>
            <input className={styles.input} name="address" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>PLZ <span className={styles.required}>*</span></span>
            <input className={styles.input} name="postalCode" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>Stadt <span className={styles.required}>*</span></span>
            <input className={styles.input} name="city" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>Bundesland <span className={styles.required}>*</span></span>
            <input className={styles.input} name="state" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>Land <span className={styles.required}>*</span></span>
            <select
              className={styles.input}
              defaultValue="DE"
              name="countryCode"
              onChange={(event) => {
                const country = countries.find((item) => item.code === event.target.value);
                if (country) setPhoneCountryCode(country.phone);
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
        </div>
      </div>
    </>
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

function priceSelectionKey(price: ApiProduct["prices"][number], productType: string) {
  return productType === "DOMAIN" ? priceKey(price) : price.id;
}

function priceKey(price: ApiProduct["prices"][number]) {
  return price.billingCycle;
}

function domainSelectablePrices(product: ApiProduct, prices: ApiDomainPrice[], domain: string, action: "register" | "transfer") {
  const productYearPrices = product.prices
    .filter((price) => price.billingCycle.startsWith("YEAR_"))
    .sort((a, b) => yearsFromCycle(a.billingCycle) - yearsFromCycle(b.billingCycle));
  const fallbackPrice = productYearPrices[0] ?? product.prices[0];
  const tld = domainTld(domain);
  const tldPrices = tld
    ? prices
        .filter((price) => price.tld === tld && price.action === action && price.amountCents > 0 && price.years > 0)
        .sort((a, b) => a.years - b.years)
    : [];

  if (!fallbackPrice) {
    return [];
  }
  if (tldPrices.length === 0) {
    return productYearPrices;
  }

  return tldPrices.map((domainPrice) => {
    const billingCycle = `YEAR_${domainPrice.years}`;
    const productPrice = productYearPrices.find((price) => price.billingCycle === billingCycle) ?? fallbackPrice;
    return {
      ...productPrice,
      amountCents: domainPrice.amountCents,
      billingCycle,
      currency: domainPrice.currency ?? productPrice.currency
    };
  });
}

function priceForCycle(product: ApiProduct, cycle?: string) {
  if (cycle?.startsWith("YEAR_")) {
    return product.prices.find((price) => price.billingCycle === cycle) ?? product.prices.find((price) => price.billingCycle.startsWith("YEAR_")) ?? product.prices[0];
  }

  return product.prices.find((price) => price.billingCycle === "YEAR_1") ?? product.prices.find((price) => price.billingCycle.startsWith("YEAR_")) ?? product.prices[0];
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

function profileCheckoutCustomer(profile: ClientProfile) {
  return {
    address: profileAddress(profile),
    countryCode: profile.countryCode ?? "DE",
    customerType: profile.customerType ?? "INDIVIDUAL",
    email: profile.email,
    companyName: "",
    name: profile.name,
    password: "",
    phone: profile.phone ?? "",
    vatId: profile.vatId ?? ""
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
  { method: "SANDBOX", title: "Sandbox" },
  { method: "CREDIT_CARD", title: "Kredit-/Debitkarte" },
  { method: "PAYPAL", title: "PayPal" },
  { method: "SEPA", title: "SEPA Lastschrift" }
];

function paymentMark(method: string) {
  if (method === "SANDBOX") return "TEST";
  if (method === "PAYPAL") return "PayPal";
  if (method === "SEPA") return "SEPA";
  return "VISA · MC";
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
    const domainYears = yearsFromCycle(input.selectedPrice?.billingCycle);
    const domainUnitPrice = domainUnitPriceCents(input.domainCheck, input.selectedPrice, input.product.minimumPriceCents);
    lines.push({
      amountCents: domainYears * domainUnitPrice,
      id: "domain",
      kind: "domain",
      detail: `${domainYears} Jahr${domainYears === 1 ? "" : "e"} · ${money(domainUnitPrice)} / Jahr`,
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
      const domainYears = yearsFromCycle(input.selectedPrice?.billingCycle);
      const domainUnitPrice = domainUnitPriceCents(input.domainCheck, priceForCycle(input.domainProduct, input.selectedPrice?.billingCycle), input.domainProduct.minimumPriceCents);
      const free = input.selectedPrice?.billingCycle.startsWith("YEAR_") && domainUnitPrice <= 1500;
      lines.push({
        amountCents: free ? 0 : domainYears * domainUnitPrice,
        id: "domain-addon",
        kind: "domainAddon",
        detail: `${domainYears} Jahr${domainYears === 1 ? "" : "e"} · ${money(domainUnitPrice)} / Jahr`,
        label: `${input.hostingDomain || "Domain"} ${domainUse}${free ? " (kostenlos)" : ""}`,
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

function domainUnitPriceCents(domainCheck: DomainCheck, price?: ApiProduct["prices"][number], minimumPriceCents?: number) {
  return domainCheck.status === "ok" ? domainCheck.priceCents : price && price.amountCents > 0 ? price.amountCents : minimumPriceCents ?? 0;
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

function domainTld(domain: string) {
  const parts = domain.trim().toLowerCase().split(".").filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(".") : undefined;
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
    headers: { ...authHeaders(), "Content-Type": "application/json" },
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
