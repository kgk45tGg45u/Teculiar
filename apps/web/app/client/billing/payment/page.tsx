"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, CheckCircle, AlertCircle, CreditCard, Landmark, Loader, Wallet } from "lucide-react";
import { API_BASE_URL, authHeaders, invoiceDisplayNumber, money, type ApiInvoice } from "../../../../lib/api";
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

const METHOD_LABELS: Record<string, string> = {
  PAYPAL: "PayPal",
  CREDIT_CARD: "Credit/Debit Card",
  SEPA: "SEPA Direct Debit",
  BANK_TRANSFER: "Bank Wire Transfer",
  SANDBOX: "Sandbox (test)"
};

export default function InvoicePaymentPage() {
  const [invoice, setInvoice] = useState<ApiInvoice | null>(null);
  const [gateways, setGateways] = useState<GatewayEntry[]>([]);
  const [selected, setSelected] = useState<Method | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [sepaIban, setSepaIban] = useState("");
  const paypalRef = useRef<HTMLDivElement>(null);
  const sdkLoadedRef = useRef(false);

  const invoiceId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invoice") ?? "" : "";

  useEffect(() => {
    if (!invoiceId) { setStatus("error"); setMessage("No invoice specified."); return; }
    Promise.all([
      fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}`, { headers: authHeaders("client") }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_BASE_URL}/storefront/payment-gateways`).then((r) => r.json()).catch(() => [])
    ]).then(([inv, gws]) => {
      if (!inv) { setStatus("error"); setMessage("Invoice not found."); return; }
      setInvoice(inv as ApiInvoice);
      const list = (Array.isArray(gws) ? gws : []) as GatewayEntry[];
      setGateways(list);
      // Pre-select first available method
      const first = list[0]?.method as Method | undefined;
      if (first) setSelected(first);
      setStatus("ready");
    });
  }, [invoiceId]);

  // Load PayPal SDK when PayPal is selected
  useEffect(() => {
    if (selected !== "PAYPAL" || status !== "ready") return;
    const paypalGw = gateways.find((g) => g.method === "PAYPAL");
    const clientId = paypalGw?.config?.clientId;
    if (!clientId) return;

    const doRender = () => renderPayPalButtons(invoiceId, setStatus, setMessage);

    if (sdkLoadedRef.current || window.paypal) { doRender(); return; }
    const existing = document.getElementById("paypal-sdk");
    if (existing) { doRender(); return; }

    sdkLoadedRef.current = true;
    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture&vault=true&disable-funding=credit,card`;
    script.crossOrigin = "anonymous";
    script.onload = doRender;
    script.onerror = () => { setStatus("error"); setMessage("PayPal could not be loaded. Try again later."); };
    document.head.appendChild(script);
  }, [selected, status, gateways, invoiceId]);

  // Re-render PayPal buttons when switching back to PayPal
  useEffect(() => {
    if (selected === "PAYPAL" && window.paypal && paypalRef.current) {
      renderPayPalButtons(invoiceId, setStatus, setMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function payWithMollie(method: "CREDIT_CARD" | "SEPA" | "SANDBOX", iban?: string) {
    setStatus("processing");
    setMessage("Processing payment…");
    const body: Record<string, string> = { method, paymentMethodId: "mollie" };
    if (method === "SEPA" && iban) body.iban = iban.replace(/\s/g, "");
    const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pay`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...authHeaders("client") },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setStatus("error"); setMessage(payload?.message ?? "Payment failed."); return; }
    if (payload?.paymentRedirectUrl) { window.location.assign(payload.paymentRedirectUrl); return; }
    if (payload?.invoice?.status === "PENDING" || payload?.status === "PENDING") {
      setStatus("paid");
      setMessage("Your SEPA debit has been initiated. It may take 1–3 business days to process.");
      setTimeout(() => window.location.assign(`/client/invoices/${invoiceId}`), 3000);
      return;
    }
    if (payload?.status === "PAID") { window.location.assign(`/client/invoices/${invoiceId}`); return; }
    setStatus("error");
    setMessage("Payment could not be started. Please try again.");
  }

  if (status === "loading") return (
    <main className={styles.page}><div className={styles.card}><Loader className={styles.spinner} size={28} /><p>Loading…</p></div></main>
  );

  if (status === "paid") return (
    <main className={styles.page}><div className={styles.card}>
      <CheckCircle size={40} className={styles.iconSuccess} />
      <h1>Payment Successful</h1>
      <p>Your invoice has been paid. Redirecting…</p>
    </div></main>
  );

  if (status === "error" && !invoice) return (
    <main className={styles.page}><div className={styles.card}>
      <AlertCircle size={32} className={styles.iconError} />
      <h1>Error</h1>
      <p>{message || "Something went wrong."}</p>
      <a className={styles.back} href="/client/invoices">Back to invoices</a>
    </div></main>
  );

  const displayNumber = invoice ? invoiceDisplayNumber(invoice) : "";
  const amount = invoice ? money(invoice.totalCents, invoice.currency ?? "EUR") : "";
  const bankWire = gateways.find((g) => g.method === "BANK_TRANSFER");
  const isProcessing = status === "processing";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <CreditCard size={22} />
          <h1>Pay Invoice</h1>
        </div>

        {invoice && (
          <div className={styles.invoiceSummary}>
            <div className={styles.invoiceRow}><span>Invoice</span><strong>{displayNumber}</strong></div>
            <div className={styles.invoiceRow}><span>Amount due</span><strong className={styles.amount}>{amount}</strong></div>
          </div>
        )}

        {gateways.length === 0 ? (
          <p className={styles.noGateway}>No payment methods are currently available. Please contact support.</p>
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
                <div className={styles.processing}><Loader className={styles.spinner} size={16} /><span>{message || "Processing…"}</span></div>
              )}

              {/* PayPal */}
              {selected === "PAYPAL" && !isProcessing && (
                <div className={styles.paypalSection}>
                  <p className={styles.hint}>Log in to PayPal to complete payment. Your PayPal will be saved for automatic future invoices.</p>
                  <div id="paypal-button-container" ref={paypalRef} className={styles.paypalContainer} />
                </div>
              )}

              {/* Credit Card */}
              {selected === "CREDIT_CARD" && !isProcessing && (
                <div className={styles.mollieSection}>
                  <p className={styles.hint}>Pay securely by credit or debit card. Your card will be saved for automatic future invoices.</p>
                  <button className={styles.payBtn} type="button" onClick={() => payWithMollie("CREDIT_CARD")}>
                    <CreditCard size={17} /> Pay with Credit/Debit Card
                  </button>
                </div>
              )}

              {/* SEPA */}
              {selected === "SEPA" && !isProcessing && (
                <div className={styles.mollieSection}>
                  <p className={styles.hint}>Pay via SEPA Direct Debit. Enter your IBAN and we will initiate the debit. It may take 1–3 business days to clear.</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                    <label htmlFor="sepaIban" style={{ fontSize: "14px", fontWeight: 500 }}>IBAN</label>
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
                    <Building2 size={17} /> Pay with SEPA Direct Debit
                  </button>
                </div>
              )}

              {/* Sandbox */}
              {selected === "SANDBOX" && !isProcessing && (
                <div className={styles.mollieSection}>
                  <p className={styles.hint}>Test payment — no real money is charged.</p>
                  <button className={styles.payBtn} type="button" onClick={() => payWithMollie("SANDBOX")}>
                    <CreditCard size={17} /> Complete Test Payment
                  </button>
                </div>
              )}

              {/* Bank Wire */}
              {selected === "BANK_TRANSFER" && !isProcessing && (
                <BankWirePanel amount={amount} bankWire={bankWire} invoiceId={invoiceId} invoiceNumber={displayNumber} />
              )}
            </div>

            <a className={styles.back} href={`/client/invoices/${invoiceId}`}>Cancel and go back</a>
          </>
        )}
      </div>
    </main>
  );
}

function renderPayPalButtons(invoiceId: string, setStatus: (s: Status) => void, setMessage: (m: string) => void) {
  if (!window.paypal) return;
  const container = document.getElementById("paypal-button-container");
  if (!container) return;
  container.innerHTML = "";
  window.paypal.Buttons({
    style: { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 45 },
    createOrder: async () => {
      setStatus("processing");
      setMessage("Starting PayPal checkout…");
      const response = await fetch(`${API_BASE_URL}/billing/invoices/${invoiceId}/pay`, {
        body: JSON.stringify({ method: "PAYPAL", paymentMethodId: "paypal" }),
        headers: { "Content-Type": "application/json", ...authHeaders("client") },
        method: "POST"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.message ?? "Payment initiation failed.");
        throw new Error(payload?.message ?? "Payment initiation failed.");
      }
      setStatus("processing");
      return String(payload.providerReference);
    },
    onApprove: async () => {
      setMessage("Confirming payment…");
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
        setMessage(payload?.message ?? `Payment status: ${payload?.status ?? "pending"}`);
      }
    },
    onCancel: () => { setStatus("ready"); setMessage(""); renderPayPalButtons(invoiceId, setStatus, setMessage); },
    onError: (err: unknown) => { setStatus("error"); setMessage(err instanceof Error ? err.message : "PayPal encountered an error."); }
  }).render("#paypal-button-container");
}

function MethodIcon({ method }: { method: string }) {
  if (method === "PAYPAL") return <Wallet size={16} aria-hidden />;
  if (method === "BANK_TRANSFER") return <Landmark size={16} aria-hidden />;
  return <CreditCard size={16} aria-hidden />;
}

function BankWirePanel({ bankWire, invoiceNumber, amount, invoiceId }: { amount: string; bankWire?: GatewayEntry; invoiceNumber: string; invoiceId: string }) {
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
        <p style={{ fontWeight: 700, margin: "8px 0 4px" }}>Thank you — payment noted!</p>
        <p className={styles.hint}>Our team has been notified and will verify your transfer. Your service will be activated once we confirm receipt.</p>
        <a className={styles.back} href="/client/invoices">Back to invoices</a>
      </div>
    );
  }

  return (
    <div className={styles.bankWirePanel}>
      <p className={styles.hint}>Please transfer the exact amount to the bank account below. Use your invoice number as the payment reference.</p>
      <div className={styles.bankDetails}>
        {cfg.accountHolder && <div className={styles.bankRow}><span>Account holder</span><strong>{cfg.accountHolder}</strong></div>}
        {cfg.bankName && <div className={styles.bankRow}><span>Bank</span><strong>{cfg.bankName}</strong></div>}
        {cfg.iban && <div className={styles.bankRow}><span>IBAN</span><strong className={styles.mono}>{cfg.iban}</strong></div>}
        {cfg.bic && <div className={styles.bankRow}><span>BIC / SWIFT</span><strong className={styles.mono}>{cfg.bic}</strong></div>}
        <div className={styles.bankRow}><span>Amount</span><strong>{amount}</strong></div>
        <div className={styles.bankRow}><span>Reference</span><strong className={styles.mono}>{invoiceNumber}</strong></div>
      </div>
      {cfg.referenceNote && <p className={styles.referenceNote}>{cfg.referenceNote}</p>}
      <p className={styles.bankNote}>Your service will be activated once we confirm receipt of your payment. After you have transferred the amount, click the button below.</p>
      <button className={styles.payBtn} disabled={claiming} style={{ marginTop: 8 }} type="button" onClick={handleClaimed}>
        <Landmark size={17} /> {claiming ? "Notifying…" : "I have paid — notify the team"}
      </button>
    </div>
  );
}
