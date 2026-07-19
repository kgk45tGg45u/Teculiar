"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { billingCycles, DEFAULT_TAX_COUNTRY_CONFIG, resolveVat, type TaxCountryConfig } from "@teculiar/shared";
import { API_BASE_URL, addOnName, authHeaders, authToken, cycleLabel, money, storeAuth, type ApiAddOn, type ApiDomainPrice, type ApiPaymentGateway, type ApiProduct, type AuthPayload } from "@teculiar/web-core/lib/api";
import { countriesForLocale } from "@teculiar/web-core/lib/countries";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { Button } from "@teculiar/web-core/components/ui/button";
import { notify } from "@teculiar/web-core/components/ui/toast-provider";
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
  addOnIds?: string[];
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
type ProfileField = "address" | "city" | "countryCode" | "name" | "phone" | "postalCode" | "state";

export function CheckoutForm({
  domainProduct,
  hostingProducts = [],
  initialDomain = "",
  initialDomainAction = "register",
  locale,
  product
}: CheckoutFormProps) {
  const copy = buildCheckoutCopy(locale);
  const firstPrice = product.type === "DOMAIN"
    ? product.prices.find((price) => price.billingCycle.startsWith("YEAR_")) ?? product.prices[0]
    : product.prices[0];
  const [priceSelection, setPriceSelection] = useState(firstPrice ? priceSelectionKey(firstPrice, product.type) : "");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [sepaIban, setSepaIban] = useState("");
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
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  const [phoneCountryCode, setPhoneCountryCode] = useState(splitProfilePhone().countryCode);
  const [paymentGateways, setPaymentGateways] = useState<ApiPaymentGateway[]>(() => buildDefaultGateways(copy));
  const [domainPrices, setDomainPrices] = useState<ApiDomainPrice[]>([]);
  const [domainCheck, setDomainCheck] = useState<DomainCheck>({ status: "idle" });
  const [taxCountries, setTaxCountries] = useState<TaxCountryConfig>(DEFAULT_TAX_COUNTRY_CONFIG);
  // Buyer country drives the VAT estimate. The server recomputes the authoritative VAT (incl.
  // reverse-charge) at invoice creation; this is the live checkout preview.
  const [buyerCountry, setBuyerCountry] = useState(profile?.countryCode ?? "DE");
  const [termsUrl, setTermsUrl] = useState("");
  const [state, setState] = useState<CheckoutState>({ status: "idle" });
  const [pendingBankGateway, setPendingBankGateway] = useState<ApiPaymentGateway | undefined>(undefined);
  const termsHref = termsUrl || `/${locale}/legal/agb`;
  const missingProfile = profile ? missingProfileFields(profile) : [];
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
  const productAddOns = useMemo(() => (needsDomain ? [] : (product.addOns ?? []).map((link) => link.addOn)), [needsDomain, product.addOns]);
  const chosenAddOns = useMemo(() => productAddOns.filter((addOn) => selectedAddOnIds.includes(addOn.id)), [productAddOns, selectedAddOnIds]);
  // Non-domain products carry a per-product domain requirement set in the admin panel.
  const domainMode = needsDomain ? "NOT_NEEDED" : product.domainRequirement ?? "NOT_NEEDED";
  const needsHostingDomain = domainMode !== "NOT_NEEDED";
  const domainOptional = domainMode === "OPTIONAL";
  const freeDomainEligible = Boolean(
    needsHostingDomain && freeDomainApplies(product, selectedPrice?.billingCycle) && domainCheck.status === "ok" && domainCheck.priceCents <= 1500
  );
  const countries = useMemo(() => countriesForLocale(locale), [locale]);
  // Country-aware VAT rate for the buyer (resolveVat applies the per-country rate, plus non-EU
  // export zero-rating). Reverse-charge for EU B2B is finalised server-side.
  const vatPercent = useMemo(
    () => resolveVat({ sellerCountryCode: "DE", buyerCountryCode: buyerCountry, isBusinessCustomer: false }, taxCountries).rate,
    [buyerCountry, taxCountries]
  );
  const summary = orderSummary({
    addHosting,
    chosenAddOns,
    copy,
    domainCheck,
    domainName: domainNameInput,
    domainProduct,
    domainUse,
    hostingDomain,
    locale,
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
      getJson<{ termsUrl?: string; taxCountries?: TaxCountryConfig }>("/storefront/settings")
        .then((settings) => {
          setTaxCountries(settings.taxCountries ?? DEFAULT_TAX_COUNTRY_CONFIG);
          setTermsUrl(settings.termsUrl ?? "");
        })
        .catch(() => {
          setTaxCountries(DEFAULT_TAX_COUNTRY_CONFIG);
          setTermsUrl("");
        }),
      getJson<ApiPaymentGateway[]>("/storefront/payment-gateways")
        .then((gateways) => {
          const next = gateways.length ? gateways : buildDefaultGateways(copy);
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
        if (me.countryCode) setBuyerCountry(me.countryCode);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectablePrices.some((price) => priceSelectionKey(price, product.type) === priceSelection)) {
      setPriceSelection(selectablePrices[0] ? priceSelectionKey(selectablePrices[0], product.type) : "");
    }
  }, [priceSelection, product.type, selectablePrices]);

  const initialDomainChecked = useRef(false);
  useEffect(() => {
    if (!initialDomain || initialDomainChecked.current) return;
    initialDomainChecked.current = true;
    void checkDomain(initialDomain);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDomain]);

  async function submit(formData: FormData) {
    if (!selectedPrice) {
      const message = copy.noPrice;
      setState({ status: "error", message });
      notify.error(message);
      return;
    }
    if (formData.get("acceptedTerms") !== "on") {
      const message = copy.termsRequired;
      setState({ status: "error", message });
      notify.error(message);
      return;
    }
    if (profile && missingProfileFields(profile).length > 0 && formData.get("confirmProfileCompletion") !== "on") {
      const message = copy.profileConfirmRequired;
      setState({ status: "error", message });
      notify.error(message);
      return;
    }
    const submittedPassword = profile ? "" : loggedInPassword || String(formData.get("password") ?? "");
    if (!profile && !isStrongPassword(submittedPassword)) {
      const message = copy.passwordWeak;
      setState({ status: "error", message });
      notify.error(message);
      return;
    }

    setState({ status: "loading", message: copy.orderCreating });
    notify.info(copy.orderCreating);
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
        quantity: 1,
        ...(chosenAddOns.length ? { addOnIds: chosenAddOns.map((addOn) => addOn.id) } : {})
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

    const customer = profile ? profileCheckoutCustomer(profile, formData) : {
        address: {
          city: String(formData.get("city") ?? ""),
          line1: String(formData.get("address") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          state: String(formData.get("state") ?? "")
        },
        countryCode: String(formData.get("countryCode") ?? "DE"),
        customerType: String(formData.get("companyName") ?? "").trim() ? "BUSINESS" : "INDIVIDUAL",
        email: customerEmail,
        companyName: String(formData.get("companyName") ?? ""),
        name: String(formData.get("name") ?? ""),
        password: submittedPassword,
        phone,
        vatId: String(formData.get("vatId") ?? "")
      };
    if (profile && missingCheckoutCustomerFields(customer).length > 0) {
      const message = copy.profileMissingError;
      setState({ status: "error", message });
      notify.error(message);
      return;
    }

    const body = {
      customer,
      items
    };

    let checkoutOrderId: string | undefined;
    try {
      const checkoutResponse = await postJson<{ order: { id: string } }>("/orders/checkout", body);
      checkoutOrderId = checkoutResponse.order.id;
      notify.success(copy.orderCreated);
      setState({ status: "loading", message: copy.paymentRunning });
      let paymentResponse: { invoice?: { status?: string }; paymentRedirectUrl?: string };
      try {
        paymentResponse = await postJson<{ invoice?: { status?: string }; paymentRedirectUrl?: string }>(`/orders/${checkoutOrderId}/pay`, {
          method: paymentMethod === "SANDBOX" ? "CREDIT_CARD" : paymentMethod,
          paymentMethodId: paymentMethod === "SANDBOX" ? "sandbox" : "checkout",
          ...(paymentMethod === "SEPA" && sepaIban ? { iban: sepaIban.replace(/\s/g, "") } : {})
        });
      } catch (payError) {
        const raw = payError instanceof Error ? payError.message : copy.orderFailed;
        throw new Error(`${copy.paymentFailed}: ${raw}`);
      }
      const redirectUrl = paymentResponse.paymentRedirectUrl ?? (paymentResponse.invoice as { paymentRedirectUrl?: string } | undefined)?.paymentRedirectUrl;
      if (redirectUrl) {
        notify.info(copy.paymentRedirect);
        window.location.assign(redirectUrl);
        return;
      }
      const invoiceStatus = (paymentResponse.invoice as { status?: string } | undefined)?.status;
      if (invoiceStatus === "PENDING") {
        if (profile) {
          window.location.assign(`/client?order=${checkoutOrderId}`);
          return;
        }
        const bankGw = paymentMethod === "BANK_TRANSFER" ? paymentGateways.find((g) => g.method === "BANK_TRANSFER") : undefined;
        setPendingBankGateway(bankGw);
        const pendingMsg = paymentMethod === "BANK_TRANSFER" ? copy.bankTransferPending : copy.sepaPending;
        notify.info(pendingMsg);
        setState({ status: "success", message: pendingMsg, orderId: checkoutOrderId });
        return;
      }
      if (!profile) {
        const auth = await postJson<AuthPayload>("/auth/login", {
          email: customerEmail,
          password: submittedPassword
        });
        storeAuth(auth);
      }
      notify.success(copy.paymentSuccess);
      if (items.some((item) => hostingProducts.some((hosting) => hosting.id === item.productId) || product.type === "SHARED_HOSTING")) {
        notify.info(copy.hostingActivating);
      }
      setState({
        status: "success",
        message: copy.portalRedirect,
        orderId: checkoutOrderId
      });
      notify.success(copy.portalRedirect);
      window.location.assign(`/client?order=${checkoutOrderId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.orderFailed;
      setState({ status: "error", message });
      notify.error(message);
      if (error instanceof Error && error.message.toLowerCase().includes("already registered")) {
        setLoginOpen(true);
      }
    }
  }

  async function checkDomain(domain: string) {
    const clean = domain.trim().toLowerCase();
    if (!clean) {
      const message = copy.domainMissing;
      setDomainCheck({ status: "error", message });
      notify.error(message);
      return;
    }
    setDomainCheck({ status: "loading" });
    notify.info(copy.domainCheckLoading);
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
      notify.success(copy.domainCheckSuccess(result.domain, result.available));
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.domainCheckFailed;
      setDomainCheck({ status: "error", message });
      notify.error(message);
    }
  }

  async function loginClient() {
    setState({ status: "loading", message: copy.loginRunning });
    try {
      const auth = await postJson<AuthPayload>("/auth/login", { email: loginEmail, password: loginPassword });
      storeAuth(auth);
      const me = await getJson<ClientProfile>("/users/me", auth.accessToken);
      setProfile(me);
      setLoggedInPassword(loginPassword);
      setPhoneCountryCode(splitProfilePhone(me.phone).countryCode);
      if (me.countryCode) setBuyerCountry(me.countryCode);
      setPassword("");
      setLoginOpen(false);
      setState({ status: "idle" });
      notify.success(copy.loginSuccess);
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.loginFailed;
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
            <span className={styles.summaryEyebrow}>{copy.orderEyebrow}</span>
            <h1 className={styles.summaryTitle}>{product.name}</h1>
            {product.description ? <p className={styles.summaryDesc}>{product.description}</p> : null}
          </div>

          <div className={styles.billingCycleRow}>
            <label className={styles.fieldLabel}>
              {copy.billingCycle}
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
                    {cycleLabel(price.billingCycle, locale)}
                    {product.type === "DOMAIN" && price.amountCents > 0 ? ` — ${money(price.amountCents, price.currency)}` : ""}
                    {product.type === "DOMAIN" ? "" : ` — ${money(price.amountCents, price.currency)}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {productAddOns.length > 0 ? (
            <div className={styles.addOnPicker}>
              <p className={styles.summarySubheading}>{copy.addOnsTitle}</p>
              {productAddOns.map((addOn) => (
                <label className={styles.addOnOption} key={addOn.id}>
                  <input
                    checked={selectedAddOnIds.includes(addOn.id)}
                    onChange={(event) =>
                      setSelectedAddOnIds((ids) => (event.target.checked ? [...ids, addOn.id] : ids.filter((id) => id !== addOn.id)))
                    }
                    type="checkbox"
                  />
                  <span className={styles.addOnOptionInfo}>
                    <span>{addOnName(addOn, locale)}</span>
                    <small>
                      {money(addOn.amountCents)} / {cycleLabel(addOn.billingCycle || (selectedPrice?.billingCycle ?? ""), locale)}
                      {(addOn.setupFeeCents ?? 0) > 0 ? ` · ${copy.addOnSetupFee}: ${money(addOn.setupFeeCents ?? 0)}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <div className={styles.orderSummary}>
            <p className={styles.summarySubheading}>{copy.summary}</p>
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
                      title={copy.editDomain}
                    >
                      ✎
                    </button>
                  ) : null}
                  {line.kind === "hostingAddon" ? (
                    <button className={styles.iconButton} type="button" onClick={() => setShowHostingOffer(true)} title={copy.editHosting}>
                      ✎
                    </button>
                  ) : null}
                  {line.removable ? (
                    <button
                      className={styles.removeButton}
                      aria-label={`${line.label} ${copy.remove}`}
                      type="button"
                      onClick={() => {
                        if (line.kind === "hostingAddon") setAddHosting(false);
                        if (line.kind === "domainAddon") setDomainUse("external");
                        if (line.kind === "productAddOn") setSelectedAddOnIds((ids) => ids.filter((id) => `addon-${id}` !== line.id));
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
                <span>{copy.vat} {vatPercent}%</span>
                <span>{money(summary.vatCents)}</span>
              </div>
            ) : null}

            <div className={styles.summaryTotal}>
              <span>{copy.total}</span>
              <strong>{money(summary.totalCents)}</strong>
            </div>
          </div>

          {needsDomain && hostingProducts.length > 0 ? (
            <Button type="button" variant="secondary" onClick={() => setShowHostingOffer(true)}>
              {copy.addHosting}
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
                <span>{copy.loggedInAs} <strong>{profile.email}</strong></span>
              </div>
            ) : (
              <>
                <div className={styles.loginToggleRow}>
                  <span className={styles.loginHint}>{copy.existingCustomer}</span>
                  <button className={styles.linkButton} type="button" onClick={() => setLoginOpen(!loginOpen)}>
                    {loginOpen ? copy.cancel : copy.login}
                  </button>
                </div>
                {loginOpen ? (
                  <div className={styles.loginGrid}>
                    <label className={styles.fieldLabel}>
                      {copy.email}
                      <input autoComplete="email" className={styles.input} name="loginEmail" onChange={(event) => setLoginEmail(event.target.value)} type="email" value={loginEmail} />
                    </label>
                    <label className={styles.fieldLabel}>
                      {copy.password}
                      <input autoComplete="current-password" className={styles.input} name="loginPassword" onChange={(event) => setLoginPassword(event.target.value)} type="password" value={loginPassword} />
                    </label>
                    <Button type="button" onClick={loginClient}>
                      {copy.login}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Domain section */}
          {needsDomain ? (
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>{copy.domain}</p>
              <label className={styles.fieldLabel}>
                <span>{copy.domainName} <span className={styles.required}>*</span></span>
                <div className={styles.domainCheckRow}>
                  <input
                    autoComplete="off"
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
                  <Button className={styles.domainActionButton} size="sm" type="button" variant="secondary" onClick={() => checkDomain(domainNameInput)}>
                    {copy.domainCheck}
                  </Button>
                </div>
              </label>
              {domainCheck.status === "loading" ? <p className={styles.statusMsg}>{copy.domainChecking}</p> : null}
              {domainCheck.status === "ok" ? (
                <p className={domainCheck.available ? styles.available : styles.unavailable}>
                  {domainCheck.available ? "✓" : "✕"} {copy.domainCheckResult(domainCheck.domain, domainCheck.action)}
                </p>
              ) : null}
              {(domainCheck.status === "ok" ? domainCheck.action : initialDomainAction) === "transfer" ? (
                <label className={styles.fieldLabel}>
                  <span>{copy.authCode} <span className={styles.required}>*</span></span>
                  <input autoComplete="off" className={styles.input} name="transferAuthCode" required />
                </label>
              ) : null}
              {showNameServers ? (
                <label className={styles.fieldLabel}>
                  {copy.nameServers}
                  <input autoComplete="off" className={styles.input} name="nameServers" placeholder="ns1.dezhost.test, ns2.dezhost.test" />
                  <button className={styles.linkButton} type="button" onClick={() => setShowNameServers(false)}>
                    {copy.hideNameServers}
                  </button>
                </label>
              ) : (
                <button className={styles.linkButton} type="button" onClick={() => setShowNameServers(true)}>
                  {copy.addNameServers}
                </button>
              )}
            </div>
          ) : null}

          {/* Hosting domain section */}
          {needsHostingDomain ? (
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>{copy.hostingDomain}</p>
              {domainOptional ? <p className={styles.statusMsg}>{copy.domainOptionalNote}</p> : null}
              <label className={styles.fieldLabel}>
                <span>{copy.domain} {domainOptional ? null : <span className={styles.required}>*</span>}</span>
                <div className={styles.domainCheckRow}>
                  <input
                    autoComplete="off"
                    className={styles.input}
                    name="hostingDomainName"
                    onChange={(event) => {
                      setHostingDomain(event.target.value);
                      setDomainCheck({ status: "idle" });
                    }}
                    placeholder="example.de"
                    required={!domainOptional}
                    value={hostingDomain}
                  />
                  <Button className={styles.domainActionButton} size="sm" type="button" variant="secondary" onClick={() => checkDomain(hostingDomain)}>
                    {copy.domainCheck}
                  </Button>
                </div>
              </label>
              {domainCheck.status === "loading" ? <p className={styles.statusMsg}>{copy.domainChecking}</p> : null}
              {domainCheck.status === "ok" && domainCheck.available ? (
                <p className={styles.available}>✓ {copy.domainAvailable(domainCheck.domain)}</p>
              ) : null}
              {domainCheck.status === "ok" && !domainCheck.available ? (
                <div className={styles.choiceGrid}>
                  <p className={styles.unavailable}>✕ {copy.domainUnavailable(domainCheck.domain)}</p>
                  <label className={styles.radioLabel}>
                    <input checked={domainUse === "transfer"} onChange={() => setDomainUse("transfer")} type="radio" />
                    {copy.transferDomain}
                  </label>
                  <label className={styles.radioLabel}>
                    <input checked={domainUse === "external"} onChange={() => setDomainUse("external")} type="radio" />
                    {copy.keepExternal}
                  </label>
                </div>
              ) : null}
              {domainUse === "transfer" ? (
                <label className={styles.fieldLabel}>
                  <span>{copy.authCode} <span className={styles.required}>*</span></span>
                  <input autoComplete="off" className={styles.input} name="hostingTransferAuthCode" required />
                </label>
              ) : null}
              {freeDomainEligible ? <p className={styles.available}>✓ {copy.freeDomainIncluded}</p> : null}
              {domainCheck.status === "ok" && freeDomainApplies(product, selectedPrice?.billingCycle) && domainCheck.priceCents > 1500 ? (
                <p className={styles.unavailable}>{copy.freeDomainLimit}</p>
              ) : null}
            </div>
          ) : null}

          {/* Hosting upsell modal */}
          {needsDomain && hostingProducts.length > 0 && showHostingOffer ? (
            <div className={styles.modalBackdrop}>
              <section className={styles.hostingModal}>
                <div className={styles.modalHeader}>
                  <h2 className={styles.modalTitle}>{copy.addHostingTitle}</h2>
                  <button className={styles.modalClose} type="button" onClick={() => setShowHostingOffer(false)} aria-label={copy.close}>✕</button>
                </div>
                <p className={styles.modalDesc}>{copy.hostingUpsell}</p>
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
                        {productHighlights(hosting, copy).map((highlight) => <li key={highlight}>{highlight}</li>)}
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
                            {cycleLabel(price.billingCycle, locale)} — {money(price.amountCents, price.currency)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {selectedHosting && freeDomainApplies(selectedHosting, selectedHostingPrice?.billingCycle) ? (
                  <p className={styles.available}>✓ {copy.yearlyFreeDomain}</p>
                ) : null}
                <div className={styles.modalActions}>
                  <Button type="button" onClick={() => { setAddHosting(true); setShowHostingOffer(false); notify.info(copy.hostingAdded); }}>
                    {copy.addHostingTitle}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowHostingOffer(false)}>
                    {copy.domainOnly}
                  </Button>
                </div>
              </section>
            </div>
          ) : null}

          {!profile ? <ContactFields
            copy={copy}
            countries={countries}
            onCountry={setBuyerCountry}
            password={password}
            phoneCountryCode={phoneCountryCode}
            setPassword={setPassword}
            setPhoneCountryCode={setPhoneCountryCode}
            setShowPassword={setShowPassword}
            showPassword={showPassword}
          /> : null}
          {profile && missingProfile.length > 0 ? <ProfileCompletionFields
            copy={copy}
            countries={countries}
            missingFields={missingProfile}
            onCountry={setBuyerCountry}
            phoneCountryCode={phoneCountryCode}
            profile={profile}
            setPhoneCountryCode={setPhoneCountryCode}
          /> : null}

          {/* Payment */}
          <div className={styles.formSection}>
            <p className={styles.sectionLabel}>{copy.paymentMethod}</p>
            <div className={styles.paymentGrid}>
              {paymentGateways.map((gateway) => (
                <label className={paymentMethod === gateway.method ? styles.paymentSelected : styles.paymentCard} key={gateway.method}>
                  <input
                    checked={paymentMethod === gateway.method}
                    name="paymentMethod"
                    onChange={() => setPaymentMethod(gateway.method)}
                    type="radio"
                    value={gateway.method}
                  />
                  <span className={styles.paymentLogo}>{paymentLogo(gateway.method, gateway.title)}</span>
                  <strong className={styles.paymentLabel}>{gateway.title}</strong>
                </label>
              ))}
            </div>
            {paymentMethod === "SEPA" && (
              <div className={styles.formGroup} style={{ marginTop: "12px" }}>
                <label className={styles.label} htmlFor="sepaIban">
                  {copy.iban}
                </label>
                <input
                  autoComplete="off"
                  className={styles.input}
                  id="sepaIban"
                  maxLength={34}
                  onChange={(e) => setSepaIban(e.target.value.toUpperCase())}
                  placeholder="DE89 3704 0044 0532 0130 00"
                  required={paymentMethod === "SEPA"}
                  type="text"
                  value={sepaIban}
                />
              </div>
            )}
          </div>

          {/* Submit */}
          <div className={styles.submitRow}>
            <label className={styles.termsCheck}>
              <input name="acceptedTerms" required type="checkbox" />
              <span>
                {copy.termsPrefix} <a href={termsHref} rel="noreferrer" target="_blank">{copy.termsLink}</a>{copy.termsSuffix}
              </span>
            </label>
            <Button type="submit">{copy.submit}</Button>
            {state.status !== "idle" ? (
              <p className={`${styles.statusMsg} ${styles[state.status]}`}>
                {state.message}
                {state.status === "success" && !pendingBankGateway ? (
                  <> <a href={`/client?order=${state.orderId}`} className={styles.portalLink}>{copy.portalLink} →</a></>
                ) : null}
              </p>
            ) : null}
            {pendingBankGateway?.config?.iban ? (
              <dl className={styles.bankDetails}>
                {pendingBankGateway.config.accountHolder ? (
                  <div className={styles.bankRow}><dt>{copy.bankAccountHolder}:</dt><dd>{pendingBankGateway.config.accountHolder}</dd></div>
                ) : null}
                {pendingBankGateway.config.bankName ? (
                  <div className={styles.bankRow}><dt>{copy.bankNameLabel}:</dt><dd>{pendingBankGateway.config.bankName}</dd></div>
                ) : null}
                <div className={styles.bankRow}><dt>IBAN:</dt><dd>{pendingBankGateway.config.iban}</dd></div>
                {pendingBankGateway.config.bic ? (
                  <div className={styles.bankRow}><dt>BIC:</dt><dd>{pendingBankGateway.config.bic}</dd></div>
                ) : null}
                {pendingBankGateway.config.referenceNote ? (
                  <div className={styles.bankRow}><dt>{copy.bankReference}:</dt><dd>{pendingBankGateway.config.referenceNote}</dd></div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordRules({ copy, password }: { copy: CheckoutCopy; password: string }) {
  const rules = [
    { label: copy.passwordRuleLength, passed: password.length >= 9 && password.length <= 16 },
    { label: copy.passwordRuleUpper, passed: /[A-Z]/.test(password) },
    { label: copy.passwordRuleLower, passed: /[a-z]/.test(password) },
    { label: copy.passwordRuleNumber, passed: /\d/.test(password) },
    { label: copy.passwordRuleSpecial, passed: /[~*!@$#%_+.?:,{}]/.test(password) }
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
  copy,
  countries,
  onCountry,
  password,
  phoneCountryCode,
  setPassword,
  setPhoneCountryCode,
  setShowPassword,
  showPassword
}: {
  copy: CheckoutCopy;
  countries: CountryOption[];
  onCountry: (code: string) => void;
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
        <p className={styles.sectionLabel}>{copy.personalData}</p>
        <div className={styles.grid}>
          <label className={styles.fieldLabel}>
            <span>{copy.name} <span className={styles.required}>*</span></span>
            <input autoComplete="name" className={styles.input} name="name" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.email} <span className={styles.required}>*</span></span>
            <input autoComplete="email" className={styles.input} name="email" required type="email" />
          </label>
          <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
            <span>{copy.password} <span className={styles.required}>*</span></span>
            <div className={styles.passwordControl}>
              <div className={styles.passwordInputWrap}>
                <input
                  autoComplete="new-password"
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
                  aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
                </button>
              </div>
              <button className={styles.generateButton} onClick={() => setPassword(generatePassword())} type="button">
                {copy.generate}
              </button>
            </div>
            <PasswordRules copy={copy} password={password} />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.phone} <span className={styles.required}>*</span></span>
            <div className={styles.phoneField}>
              <input
                autoComplete="tel-country-code"
                className={styles.input}
                aria-label={copy.phoneCode}
                inputMode="tel"
                name="phoneCountryCode"
                onChange={(event) => setPhoneCountryCode(event.target.value)}
                required
                type="tel"
                value={phoneCountryCode}
              />
              <input autoComplete="tel-national" className={styles.input} inputMode="tel" name="phone" required type="tel" />
            </div>
          </label>
        </div>
      </div>
      <div className={styles.formSection}>
        <p className={styles.sectionLabel}>{copy.company} <span className={styles.optionalBadge}>{copy.optional}</span></p>
        <div className={styles.grid}>
          <label className={styles.fieldLabel}>
            {copy.companyName}
            <input autoComplete="organization" className={styles.input} name="companyName" placeholder={copy.companyPlaceholder} />
          </label>
          <label className={styles.fieldLabel}>
            {copy.vatId}
            <input autoComplete="off" className={styles.input} name="vatId" placeholder="DE123456789" />
          </label>
        </div>
      </div>
      <div className={styles.formSection}>
        <p className={styles.sectionLabel}>{copy.addressTitle}</p>
        <div className={styles.grid}>
          <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
            <span>{copy.street} <span className={styles.required}>*</span></span>
            <input autoComplete="street-address" className={styles.input} name="address" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.postalCode} <span className={styles.required}>*</span></span>
            <input autoComplete="postal-code" className={styles.input} name="postalCode" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.city} <span className={styles.required}>*</span></span>
            <input autoComplete="address-level2" className={styles.input} name="city" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.state} <span className={styles.required}>*</span></span>
            <input autoComplete="address-level1" className={styles.input} name="state" required />
          </label>
          <label className={styles.fieldLabel}>
            <span>{copy.country} <span className={styles.required}>*</span></span>
            <select
              autoComplete="country"
              className={styles.input}
              defaultValue="DE"
              name="countryCode"
              onChange={(event) => {
                onCountry(event.target.value);
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

function ProfileCompletionFields({
  copy,
  countries,
  missingFields,
  onCountry,
  phoneCountryCode,
  profile,
  setPhoneCountryCode
}: {
  copy: CheckoutCopy;
  countries: CountryOption[];
  missingFields: ProfileField[];
  onCountry: (code: string) => void;
  phoneCountryCode: string;
  profile: ClientProfile;
  setPhoneCountryCode: (code: string) => void;
}) {
  const address = profileAddress(profile);
  const phone = splitProfilePhone(profile.phone);

  return (
    <div className={styles.formSection}>
      <p className={styles.sectionLabel}>{copy.profileCompletionTitle}</p>
      <p className={styles.sectionHelp}>{copy.profileCompletionHelp}</p>
      <div className={styles.grid}>
        {missingFields.includes("name") ? (
          <label className={styles.fieldLabel}>
            <span>{copy.name} <span className={styles.required}>*</span></span>
            <input autoComplete="name" className={styles.input} defaultValue={profile.name} name="name" required />
          </label>
        ) : null}
        {missingFields.includes("phone") ? (
          <label className={styles.fieldLabel}>
            <span>{copy.phone} <span className={styles.required}>*</span></span>
            <div className={styles.phoneField}>
              <input
                autoComplete="tel-country-code"
                aria-label={copy.phoneCode}
                className={styles.input}
                inputMode="tel"
                name="phoneCountryCode"
                onChange={(event) => setPhoneCountryCode(event.target.value)}
                required
                type="tel"
                value={phoneCountryCode}
              />
              <input autoComplete="tel-national" className={styles.input} defaultValue={phone.number} inputMode="tel" name="phone" required type="tel" />
            </div>
          </label>
        ) : null}
        {missingFields.includes("address") ? (
          <label className={`${styles.fieldLabel} ${styles.spanFull}`}>
            <span>{copy.street} <span className={styles.required}>*</span></span>
            <input autoComplete="street-address" className={styles.input} defaultValue={address.line1} name="address" required />
          </label>
        ) : null}
        {missingFields.includes("postalCode") ? (
          <label className={styles.fieldLabel}>
            <span>{copy.postalCode} <span className={styles.required}>*</span></span>
            <input autoComplete="postal-code" className={styles.input} defaultValue={address.postalCode} name="postalCode" required />
          </label>
        ) : null}
        {missingFields.includes("city") ? (
          <label className={styles.fieldLabel}>
            <span>{copy.city} <span className={styles.required}>*</span></span>
            <input autoComplete="address-level2" className={styles.input} defaultValue={address.city} name="city" required />
          </label>
        ) : null}
        {missingFields.includes("state") ? (
          <label className={styles.fieldLabel}>
            <span>{copy.state} <span className={styles.required}>*</span></span>
            <input autoComplete="address-level1" className={styles.input} defaultValue={address.state} name="state" required />
          </label>
        ) : null}
        {missingFields.includes("countryCode") ? (
          <label className={styles.fieldLabel}>
            <span>{copy.country} <span className={styles.required}>*</span></span>
            <select
              autoComplete="country"
              className={styles.input}
              defaultValue={profile.countryCode ?? "DE"}
              name="countryCode"
              onChange={(event) => {
                onCountry(event.target.value);
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
        ) : null}
      </div>
      <label className={styles.checkboxLine}>
        <input name="confirmProfileCompletion" required type="checkbox" />
        <span>{copy.profileConfirm}</span>
      </label>
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

// Checkout copy comes from the shared @teculiar/locales storefront pack (English fallback per key),
// so any configured language is covered. The four interpolated entries are wrapped back into
// functions over the pack's `{domain}`/`{action}` templates.
function buildCheckoutCopy(locale: string) {
  const c = getDictionary(locale).storefront.checkout;
  const actionWord = (action: "register" | "transfer") =>
    action === "transfer" ? c.domainActionTransfer : c.domainActionRegister;
  return {
    ...c,
    domainAvailable: (domain: string) => c.domainAvailable.replace("{domain}", domain),
    domainUnavailable: (domain: string) => c.domainUnavailable.replace("{domain}", domain),
    domainCheckResult: (domain: string, action: "register" | "transfer") =>
      c.domainCheckResult.replace("{domain}", domain).replace("{action}", actionWord(action)),
    domainCheckSuccess: (domain: string, available: boolean) =>
      c.domainCheckSuccess.replace("{domain}", domain).replace("{action}", available ? c.domainActionRegister : c.domainActionTransfer)
  };
}

function missingProfileFields(profile: ClientProfile): ProfileField[] {
  const address = profileAddress(profile);
  return [
    hasText(profile.name) ? undefined : "name",
    hasText(profile.phone) ? undefined : "phone",
    hasText(address.line1) ? undefined : "address",
    hasText(address.postalCode) ? undefined : "postalCode",
    hasText(address.city) ? undefined : "city",
    hasText(address.state) ? undefined : "state",
    hasText(profile.countryCode) ? undefined : "countryCode"
  ].filter(Boolean) as ProfileField[];
}

function profileAddress(profile?: ClientProfile) {
  return {
    city: profile?.address?.city ?? "",
    line1: profile?.address?.line1 ?? "",
    postalCode: profile?.address?.postalCode ?? "",
    state: profile?.address?.state ?? ""
  };
}

function profileCheckoutCustomer(profile: ClientProfile, formData: FormData) {
  const address = profileAddress(profile);
  return {
    address: {
      city: textOr(address.city, formDataValue(formData, "city")),
      line1: textOr(address.line1, formDataValue(formData, "address")),
      postalCode: textOr(address.postalCode, formDataValue(formData, "postalCode")),
      state: textOr(address.state, formDataValue(formData, "state"))
    },
    countryCode: textOr(profile.countryCode, formDataValue(formData, "countryCode"), "DE"),
    customerType: profile.customerType ?? "INDIVIDUAL",
    email: profile.email,
    companyName: "",
    name: textOr(profile.name, formDataValue(formData, "name")),
    password: "",
    phone: textOr(profile.phone, profilePhoneFromForm(formData)),
    vatId: profile.vatId ?? ""
  };
}

function missingCheckoutCustomerFields(customer: ReturnType<typeof profileCheckoutCustomer>) {
  return [
    customer.name,
    customer.phone,
    customer.address.line1,
    customer.address.postalCode,
    customer.address.city,
    customer.address.state,
    customer.countryCode
  ].filter((value) => !hasText(value));
}

function formDataValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function profilePhoneFromForm(formData: FormData) {
  return `${formDataValue(formData, "phoneCountryCode").trim()} ${formDataValue(formData, "phone").trim()}`.trim();
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

function textOr(value?: string | null, fallback = "", defaultValue = "") {
  return hasText(value) ? String(value).trim() : hasText(fallback) ? fallback.trim() : defaultValue;
}

function splitProfilePhone(phone?: string) {
  const clean = phone?.trim() ?? "";
  const match = clean.match(/^(\+\d{1,3})\s+(.*)$/);
  return {
    countryCode: match?.[1] ?? "+49",
    number: match?.[2] ?? clean.replace(/^\+\d{1,3}/, "").trim()
  };
}

type CheckoutCopy = ReturnType<typeof buildCheckoutCopy>;

function buildDefaultGateways(copy: CheckoutCopy): ApiPaymentGateway[] {
  return [
    { method: "SANDBOX", title: "Sandbox" },
    { method: "CREDIT_CARD", title: copy.gatewayCreditCard },
    { method: "PAYPAL", title: "PayPal" },
    { method: "SEPA", title: copy.gatewaySepa }
  ];
}

function paymentLogo(method: string, title: string) {
  if (method === "PAYPAL") {
    return (
      <svg viewBox="0 0 88 28" width="88" height="28">
        <text x="2" y="22" fontSize="22" fontWeight="900" fontFamily="Arial Black,Arial,sans-serif" fill="#003087">Pay</text>
        <text x="47" y="22" fontSize="22" fontWeight="900" fontFamily="Arial Black,Arial,sans-serif" fill="#009cde">Pal</text>
      </svg>
    );
  }
  if (method === "CREDIT_CARD") {
    return (
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <svg width="44" height="28" viewBox="0 0 44 28">
          <rect width="44" height="28" rx="4" fill="#1a1f71"/>
          <text x="22" y="20" textAnchor="middle" fill="white" fontSize="14" fontWeight="900" fontStyle="italic" fontFamily="Arial,sans-serif" letterSpacing="1">VISA</text>
        </svg>
        <svg width="44" height="28" viewBox="0 0 44 28">
          <rect width="44" height="28" rx="4" fill="#f5f5f5" stroke="#ddd" strokeWidth="0.5"/>
          <circle cx="17" cy="14" r="9.5" fill="#EB001B"/>
          <circle cx="27" cy="14" r="9.5" fill="#F79E1B"/>
        </svg>
      </div>
    );
  }
  if (method === "SEPA") {
    return (
      <svg viewBox="0 0 80 28" width="80" height="28">
        <rect width="80" height="28" rx="4" fill="#003087"/>
        <text x="40" y="19" textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="Arial,sans-serif" fill="white" letterSpacing="2">SEPA €</text>
      </svg>
    );
  }
  if (method === "BANK_TRANSFER") {
    return (
      <svg viewBox="0 0 42 36" width="42" height="36">
        <g fill="#1a1f71">
          <polygon points="21,1 41,12 1,12"/>
          <rect x="1" y="12" width="40" height="2.5"/>
          <rect x="4" y="15" width="7" height="13"/>
          <rect x="13" y="15" width="7" height="13"/>
          <rect x="22" y="15" width="7" height="13"/>
          <rect x="31" y="15" width="7" height="13"/>
          <rect x="1" y="28" width="40" height="5"/>
        </g>
      </svg>
    );
  }
  if (method === "SANDBOX") {
    return (
      <svg viewBox="0 0 60 28" width="60" height="28">
        <rect width="60" height="28" rx="6" fill="#6366f1"/>
        <text x="30" y="19" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="Arial,sans-serif" fill="white" letterSpacing="1">TEST</text>
      </svg>
    );
  }
  return (
    <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--ink)", letterSpacing: "0.04em", padding: "4px 8px" }}>{title}</span>
  );
}

function productHighlights(product: ApiProduct, copy: CheckoutCopy) {
  const highlights = (product.configs ?? [])
    .filter((config) => !config.key.startsWith("virtualmin_"))
    .map((config) => `${config.label}${config.values[0] ? `: ${String(config.values[0])}` : ""}`);
  return highlights.length ? highlights.slice(0, 4) : [copy.highlightManaged, copy.highlightSsl, copy.highlightSupport];
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
  chosenAddOns: ApiAddOn[];
  copy: CheckoutCopy;
  domainCheck: DomainCheck;
  domainName: string;
  domainProduct?: ApiProduct;
  domainUse: "external" | "register" | "transfer";
  hostingDomain: string;
  locale: string;
  needsDomain: boolean;
  needsHostingDomain: boolean;
  product: ApiProduct;
  selectedHosting?: ApiProduct;
  selectedHostingPrice?: ApiProduct["prices"][number];
  selectedPrice?: ApiProduct["prices"][number];
  vatPercent: number;
}) {
  const { copy } = input;
  const yearsWord = (years: number) => `${years} ${years === 1 ? copy.year : copy.years}`;
  const actionWord = (action: string) => (action === "transfer" ? copy.domainActionTransfer : copy.domainActionRegister);
  const lines: Array<{ amountCents: number; detail?: string; id: string; kind: "domain" | "domainAddon" | "hosting" | "hostingAddon" | "productAddOn"; label: string; removable?: boolean }> = [];

  if (input.needsDomain) {
    const domainYears = yearsFromCycle(input.selectedPrice?.billingCycle);
    const domainUnitPrice = domainUnitPriceCents(input.domainCheck, input.selectedPrice, input.product.minimumPriceCents);
    lines.push({
      amountCents: domainYears * domainUnitPrice,
      id: "domain",
      kind: "domain",
      detail: `${yearsWord(domainYears)} · ${money(domainUnitPrice)} / ${copy.year}`,
      label: `${input.domainName || copy.domain} ${input.domainCheck.status === "ok" ? actionWord(input.domainCheck.action) : copy.registration}`
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
    // First-invoice view: recurring price + one-off setup fee billed together on the first invoice.
    for (const addOn of input.chosenAddOns) {
      const setupCents = addOn.setupFeeCents ?? 0;
      lines.push({
        amountCents: addOn.amountCents + setupCents,
        detail: setupCents > 0 ? `${copy.addOnSetupFee}: ${money(setupCents)}` : undefined,
        id: `addon-${addOn.id}`,
        kind: "productAddOn",
        label: `${addOnName(addOn, input.locale)} ${cycleLabel(addOn.billingCycle || (input.selectedPrice?.billingCycle ?? ""))}`,
        removable: true
      });
    }
    const domainUse = hostingDomainUse(input.domainUse, input.domainCheck, input.hostingDomain);
    if (input.needsHostingDomain && domainUse !== "external" && input.domainProduct && input.hostingDomain.trim()) {
      const domainYears = yearsFromCycle(input.selectedPrice?.billingCycle);
      const domainUnitPrice = domainUnitPriceCents(input.domainCheck, priceForCycle(input.domainProduct, input.selectedPrice?.billingCycle), input.domainProduct.minimumPriceCents);
      const free = freeDomainApplies(input.product, input.selectedPrice?.billingCycle) && domainUnitPrice <= 1500;
      lines.push({
        amountCents: free ? 0 : domainYears * domainUnitPrice,
        id: "domain-addon",
        kind: "domainAddon",
        detail: `${yearsWord(domainYears)} · ${money(domainUnitPrice)} / ${copy.year}`,
        label: `${input.hostingDomain || copy.domain} ${actionWord(domainUse)}${free ? ` (${copy.free})` : ""}`,
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

// A product includes a free domain when it has a configured free-domain billing cycle and the
// selected cycle is at least that long (e.g. "YEAR_1" → every annual cycle qualifies).
function freeDomainApplies(product: ApiProduct, cycle?: string) {
  const threshold = product.freeDomainBillingCycle;
  if (!threshold || !cycle) {
    return false;
  }
  const ordered = billingCycles.indexOf(cycle as never);
  const minimum = billingCycles.indexOf(threshold as never);
  return ordered >= 0 && minimum >= 0 && ordered >= minimum;
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
    headers: { ...authHeaders("client"), "Content-Type": "application/json" },
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
