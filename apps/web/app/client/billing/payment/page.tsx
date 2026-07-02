"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle, AlertCircle, CreditCard, Landmark, Loader, Wallet } from "lucide-react";
import { API_BASE_URL, authHeaders, currentLocale, invoiceDisplayNumber, money, type ApiInvoice } from "@dezhost/web-core/lib/api";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import styles from "./payment.module.css";

type GatewayEntry = { config?: Record<string, string | undefined>; method: string; title: string };
type PayPalNamespace = {
  Buttons: (opts: {
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError: (err: unknown) => void;
    onCancel: () => void;
    style?: Record<string, unknown>;
  }) => { render: (sel: string) => void };
};

declare global {
  interface Window { paypal?: PayPalNamespace }
}

type Method = "PAYPAL" | "CREDIT_CARD" | "SEPA" | "BANK_TRANSFER" | "SANDBOX";
type Status = "loading" | "ready" | "processing" | "paid" | "error";

function methodLabels(c: ReturnType<typeof getDictionary>["client"]["pay"]): Record<string, string> {
  return {
    PAYPAL: "PayPal",
    CREDIT_CARD: c.methodCreditCard,
    SEPA: c.methodSepa,
    BANK_TRANSFER: c.methodBankTransfer,
    SANDBOX: c.methodSandbox
  };
}

export default function InvoicePaymentPage() {
  const c = getDictionary(currentLocale()).client.pay;
  const METHOD_LABELS = methodLabels(c);
  const [invoice, setInvoice] = useState<ApiInvoice | null>(null);
  const [gateways, setGateways] = useState<GatewayEntry[]>([]);
  const [selected, setSelected] = useState<Method | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [sepaIban, setSepaIban] = useState("");
  const [balanceCents, setBalanceCents] = useState(0);
  const [useBalance, setUseBalance] = useState(false);
  const useBalanceRef = useRef(false);
  const paypalRef = useRef<HTMLDivElement>(null);
  const sdkLoadedRef = useRef(false);

  // Keep a ref in sync so the PayPal SDK button (rendered once, outside React state) reads the
  // latest opt-in choice at click time.
  useEffect(() => { useBalanceRef.current = useBalance; }, [useBalance]);

  const invoiceId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invoice") ?? "" : "";

  useEffect(() => {
    if (!invoiceId) { setStatus("error"); setMessage(c.noInvoiceSpecified); return; }
    Promise.all([
      fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}`, { headers: authHeaders("client") }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_BASE_URL}/storefront/payment-gateways`).then((r) => r.json()).catch(() => []),
      fetch(`${API_BASE_URL}/users/me`, { headers: authHeaders("client") }).then((r) => r.ok ? r.json() : null).catch(() => null)
    ]).then(([inv, gws, profile]) => {
      if (!inv) { setStatus("error"); setMessage(c.invoiceNotFound); return; }
      setInvoice(inv as ApiInvoice);
      const list = (Array.isArray(gws) ? gws : []) as GatewayEntry[];
      setGateways(list);
      // Pre-select first available method
      const first = list[0]?.method as Method | undefined;
      if (first) setSelected(first);
      if (profile && typeof (profile as { balanceCents?: number }).balanceCents === "number") {
        setBalanceCents((profile as { balanceCents: number }).balanceCents);
      }
      setStatus("ready");
    });
  }, [invoiceId]);

  // Load PayPal SDK when PayPal is selected
  useEffect(() => {
    if (selected !== "PAYPAL" || status !== "ready") return;
    const paypalGw = gateways.find((g) => g.method === "PAYPAL");
    const clientId = paypalGw?.config?.clientId;
    if (!clientId) return;

    const doRender = () => renderPayPalButtons(invoiceId, setStatus, setMessage, () => useBalanceRef.current);

    if (sdkLoadedRef.current || window.paypal) { doRender(); return; }
    const existing = document.getElementById("paypal-sdk");
    if (existing) { doRender(); return; }

    sdkLoadedRef.current = true;
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture&vault=true&disable-funding=credit,card`;
    script.crossOrigin = "anonymous";
    script.onload = doRender;
    script.onerror = () => { setStatus("error"); setMessage(c.paypalLoadFailed); };
    document.head.appendChild(script);
  }, [selected, status, gateways, invoiceId]);

  // Re-render PayPal buttons when switching back to PayPal
  useEffect(() => {
    if (selected === "PAYPAL" && window.paypal && paypalRef.current) {
      renderPayPalButtons(invoiceId, setStatus, setMessage, () => useBalanceRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function payWithMollie(method: "CREDIT_CARD" | "SEPA" | "SANDBOX", iban?: string) {
    setStatus("processing");
    setMessage(c.processingPayment);
    const body: Record<string, string | boolean> = { method, paymentMethodId: "mollie", useAccountBalance: useBalance };
    if (method === "SEPA" && iban) body.iban = iban.replace(/\s/g, "");
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pay`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus("error"); setMessage(payload?.message ?? c.paymentFailed); return; }
    if (payload?.paymentRedirectUrl) { window.location.assign(payload.paymentRedirectUrl); return; }
    if (payload?.invoice?.status === "PENDING" || payload?.status === "PENDING") {
      setStatus("paid");
      setMessage(c.sepaInitiated);
      setTimeout(() => window.location.assign(`/client/invoices/${invoiceId}`), 3000);
      return;
    }
    if (payload?.status === "PAID") { window.location.assign(`/client/invoices/${invoiceId}`); return; }
    setStatus("error");
    setMessage(c.paymentNotStarted);
  }

  if (status === "loading") return (
    <main className={styles.page}><div className={styles.card}><Loader className={styles.spinner} size={28} /><p>{c.loading}</p></div></main>
  );

  if (status === "paid") return (
    <main className={styles.page}><div className={styles.card}>
      <CheckCircle size={40} className={styles.iconSuccess} />
      <h1>{c.paymentSuccessful}</h1>
      <p>{c.invoicePaidRedirect}</p>
    </div></main>
  );

  if (status === "error" && !invoice) return (
    <main className={styles.page}><div className={styles.card}>
      <AlertCircle size={32} className={styles.iconError} />
      <h1>{c.error}</h1>
      <p>{message || c.somethingWrong}</p>
      <a className={styles.back} href="/client/invoices">{c.backToInvoices}</a>
    </div></main>
  );

  const displayNumber = invoice ? invoiceDisplayNumber(invoice) : "";
  const totalCents = invoice?.totalCents ?? 0;
  const hasBalance = balanceCents > 0;
  // Balance is only applied when the client opts in (the checkbox), and never for funds deposits.
  const appliedBalanceCents = useBalance ? Math.min(balanceCents, totalCents) : 0;
  const netAmountCents = totalCents - appliedBalanceCents;
  const balanceCoversAll = useBalance && netAmountCents === 0 && appliedBalanceCents > 0;
  const amount = invoice ? money(totalCents, invoice.currency ?? "EUR") : "";
  const netAmount = invoice ? money(netAmountCents, invoice.currency ?? "EUR") : "";
  const bankWire = gateways.find((g) => g.method === "BANK_TRANSFER");
  const isProcessing = status === "processing";

  async function payFullyFromBalance() {
    setStatus("processing");
    setMessage(c.payingWithBalance);
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pay`, {
      body: JSON.stringify({ method: "CREDIT_CARD", paymentMethodId: "balance", useAccountBalance: true }),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && (payload?.status === "PAID" || payload?.invoice?.status === "PAID")) {
      setStatus("paid");
      window.location.assign(`/client/invoices/${invoiceId}`);
      return;
    }
    setStatus("error");
    setMessage(payload?.message ?? c.balancePayFailed);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <CreditCard size={22} />
          <h1>{c.payInvoice}</h1>
        </div>

        {invoice && (
          <div className={styles.invoiceSummary}>
            <div className={styles.invoiceRow}><span>{c.invoice}</span><strong>{displayNumber}</strong></div>
            <div className={styles.invoiceRow}><span>{c.invoiceTotal}</span><strong>{amount}</strong></div>
            {hasBalance && (
              <label className={styles.invoiceRow} style={{ cursor: "pointer", gap: "8px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={useBalance}
                    disabled={isProcessing}
                    onChange={(e) => { setUseBalance(e.target.checked); setStatus("ready"); setMessage(""); }}
                  />
                  <Wallet size={13} aria-hidden />
                  {c.useBalance.replace("{amount}", money(balanceCents, invoice.currency ?? "EUR"))}
                </span>
              </label>
            )}
            {appliedBalanceCents > 0 && (
              <div className={styles.invoiceRow} style={{ color: "#16a34a" }}>
                <span><Wallet size={13} aria-hidden style={{ display: "inline", marginRight: "4px" }} />{c.balanceApplied}</span>
                <strong>-{money(appliedBalanceCents, invoice.currency ?? "EUR")}</strong>
              </div>
            )}
            <div className={styles.invoiceRow}><span>{c.amountDue}</span><strong className={styles.amount}>{netAmount}</strong></div>
          </div>
        )}

        {balanceCoversAll ? (
          <div className={styles.methodPanel}>
            {status === "error" && message && (
              <div className={styles.errorBanner}><AlertCircle size={16} /><span>{message}</span></div>
            )}
            <p className={styles.hint}>{c.balanceCoversAll}</p>
            <button className={styles.payBtn} disabled={isProcessing} type="button" onClick={payFullyFromBalance}>
              <Wallet size={17} /> {isProcessing ? c.processing : c.payWithBalance}
            </button>
          </div>
        ) : gateways.length === 0 ? (
          <p className={styles.noGateway}>{c.noGateways}</p>
        ) : (
          <>
            {/* Method tabs */}
            <div className={styles.methodTabs} role="tablist">
              {gateways.map((gw) => (
                <button
                  aria-selected={selected === gw.method}
                  className={styles.methodTab}
                  data-active={selected === gw.method}
                  key={gw.method}
                  role="tab"
                  type="button"
                  onClick={() => { setSelected(gw.method as Method); setStatus("ready"); setMessage(""); }}
                >
                  <MethodIcon method={gw.method} />
                  <span>{METHOD_LABELS[gw.method] ?? gw.title}</span>
                </button>
              ))}
            </div>

            {/* Method panels */}
            <div className={styles.methodPanel}>
              {status === "error" && message && (
                <div className={styles.errorBanner}><AlertCircle size={16} /><span>{message}</span></div>
              )}
              {isProcessing && (
                <div className={styles.processing}><Loader className={styles.spinner} size={16} /><span>{message || c.processing}</span></div>
              )}

              {/* PayPal */}
              {selected === "PAYPAL" && !isProcessing && (
                <div className={styles.paypalSection}>
                  <p className={styles.hint}>{c.paypalHint}</p>
                  <div id="paypal-button-container" ref={paypalRef} className={styles.paypalContainer} />
                </div>
              )}

              {/* Credit Card */}
              {selected === "CREDIT_CARD" && !isProcessing && (
                <div className={styles.mollieSection}>
                  <p className={styles.hint}>{c.creditHint}</p>
                  <button className={styles.payBtn} type="button" onClick={() => payWithMollie("CREDIT_CARD")}>
                    <CreditCard size={17} /> {c.payCreditCard}
                  </button>
                </div>
              )}

              {/* SEPA */}
              {selected === "SEPA" && !isProcessing && (
                <div className={styles.mollieSection}>
                  <p className={styles.hint}>{c.sepaHint}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                    <label htmlFor="sepaIban" style={{ fontSize: "14px", fontWeight: 500 }}>{c.iban}</label>
                    <input
                      autoComplete="off"
                      id="sepaIban"
                      maxLength={34}
                      onChange={(e) => setSepaIban(e.target.value.toUpperCase())}
                      placeholder="DE89 3704 0044 0532 0130 00"
                      style={{ border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "14px", fontFamily: "monospace", padding: "8px 12px" }}
                      type="text"
                      value={sepaIban}
                    />
                  </div>
                  <button className={styles.payBtn} disabled={!sepaIban.replace(/\s/g, "")} type="button" onClick={() => payWithMollie("SEPA", sepaIban)}>
                    <Building2 size={17} /> {c.paySepa}
                  </button>
                </div>
              )}

              {/* Sandbox */}
              {selected === "SANDBOX" && !isProcessing && (
                <div className={styles.mollieSection}>
                  <p className={styles.hint}>{c.sandboxHint}</p>
                  <button className={styles.payBtn} type="button" onClick={() => payWithMollie("SANDBOX")}>
                    <CreditCard size={17} /> {c.completeTestPayment}
                  </button>
                </div>
              )}

              {/* Bank Wire */}
              {selected === "BANK_TRANSFER" && !isProcessing && (
                <BankWirePanel amount={amount} bankWire={bankWire} invoiceId={invoiceId} invoiceNumber={displayNumber} />
              )}
            </div>

            <a className={styles.back} href={`/client/invoices/${invoiceId}`}>{c.cancelGoBack}</a>
          </>
        )}
      </div>
    </main>
  );
}

function renderPayPalButtons(invoiceId: string, setStatus: (s: Status) => void, setMessage: (m: string) => void, getUseBalance: () => boolean = () => false) {
  const c = getDictionary(currentLocale()).client.pay;
  if (!window.paypal) return;
  const container = document.getElementById("paypal-button-container");
  if (!container) return;
  container.innerHTML = "";
  window.paypal.Buttons({
    style: { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 45 },
    createOrder: async () => {
      setStatus("processing");
      setMessage(c.startingPaypal);
      const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pay`, {
        body: JSON.stringify({ method: "PAYPAL", paymentMethodId: "paypal", useAccountBalance: getUseBalance() }),
        headers: { "Content-Type": "application/json", ...authHeaders("client") },
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.message ?? c.paymentInitFailed);
        throw new Error(payload?.message ?? c.paymentInitFailed);
      }
      setStatus("processing");
      return String(payload.providerReference);
    },
    onApprove: async () => {
      setMessage(c.confirmingPayment);
      const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/confirm-payment`, {
        headers: authHeaders("client"),
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.status === "PAID") {
        setStatus("paid");
        setTimeout(() => { window.location.assign(`/client/invoices/${payload.invoice?.id ?? invoiceId}`); }, 1500);
      } else {
        setStatus("error");
        setMessage(payload?.message ?? c.paymentStatus.replace("{status}", String(payload?.status ?? "pending")));
      }
    },
    onCancel: () => { setStatus("ready"); setMessage(""); renderPayPalButtons(invoiceId, setStatus, setMessage, getUseBalance); },
    onError: (err: unknown) => { setStatus("error"); setMessage(err instanceof Error ? err.message : c.paypalError); }
  }).render("#paypal-button-container");
}

function MethodIcon({ method }: { method: string }) {
  if (method === "PAYPAL") return <Wallet size={16} aria-hidden />;
  if (method === "BANK_TRANSFER") return <Landmark size={16} aria-hidden />;
  return <CreditCard size={16} aria-hidden />;
}

function BankWirePanel({ bankWire, invoiceNumber, amount, invoiceId }: { amount: string; bankWire?: GatewayEntry; invoiceNumber: string; invoiceId: string }) {
  const c = getDictionary(currentLocale()).client.pay;
  const cfg = bankWire?.config ?? {};
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  async function handleClaimed() {
    setClaiming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/bank-transfer-claimed`, {
        headers: authHeaders("client"),
        method: "POST"
      });
      if (res.ok) {
        setClaimed(true);
      }
    } finally {
      setClaiming(false);
    }
  }

  if (claimed) {
    return (
      <div className={styles.bankWirePanel}>
        <CheckCircle size={32} className={styles.iconSuccess} />
        <p style={{ fontWeight: 700, margin: "8px 0 4px" }}>{c.thankYouNoted}</p>
        <p className={styles.hint}>{c.teamNotified}</p>
        <a className={styles.back} href="/client/invoices">{c.backToInvoices}</a>
      </div>
    );
  }

  return (
    <div className={styles.bankWirePanel}>
      <p className={styles.hint}>{c.bankTransferIntro}</p>
      <div className={styles.bankDetails}>
        {cfg.accountHolder && <div className={styles.bankRow}><span>{c.accountHolder}</span><strong>{cfg.accountHolder}</strong></div>}
        {cfg.bankName && <div className={styles.bankRow}><span>{c.bank}</span><strong>{cfg.bankName}</strong></div>}
        {cfg.iban && <div className={styles.bankRow}><span>{c.iban}</span><strong className={styles.mono}>{cfg.iban}</strong></div>}
        {cfg.bic && <div className={styles.bankRow}><span>{c.bicSwift}</span><strong className={styles.mono}>{cfg.bic}</strong></div>}
        <div className={styles.bankRow}><span>{c.amount}</span><strong>{amount}</strong></div>
        <div className={styles.bankRow}><span>{c.reference}</span><strong className={styles.mono}>{invoiceNumber}</strong></div>
      </div>
      {cfg.referenceNote && <p className={styles.referenceNote}>{cfg.referenceNote}</p>}
      <p className={styles.bankNote}>{c.bankNote}</p>
      <button className={styles.payBtn} disabled={claiming} style={{ marginTop: 8 }} type="button" onClick={handleClaimed}>
        <Landmark size={17} /> {claiming ? c.notifying : c.iHavePaid}
      </button>
    </div>
  );
}
