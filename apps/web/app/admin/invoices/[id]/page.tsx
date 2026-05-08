"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, money, type ApiInvoice } from "../../../../lib/api";

export default function AdminInvoicePage({ params }: { params: { id: string } }) {
  const [invoice, setInvoice] = useState<ApiInvoice | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/dev/billing/invoices/${params.id}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setInvoice(data))
      .catch(() => undefined);
  }, [params.id]);

  async function markPaid() {
    const r = await fetch(`${API_BASE_URL}/admin/dev/billing/invoices/${params.id}/mark-paid`, {
      method: "POST",
      headers: authHeaders()
    });
    if (r.ok) {
      const data = await r.json();
      setInvoice(data);
      setMessage("Marked as paid.");
    } else {
      setMessage("Failed.");
    }
  }

  async function markUnpaid() {
    const r = await fetch(`${API_BASE_URL}/admin/dev/billing/invoices/${params.id}/mark-unpaid`, {
      method: "POST",
      headers: authHeaders()
    });
    if (r.ok) {
      const data = await r.json();
      setInvoice(data);
      setMessage("Marked as unpaid.");
    } else {
      setMessage("Failed.");
    }
  }

  if (!invoice) {
    return (
      <main style={{ padding: "40px" }}>
        <a href="/admin/invoices">← Back to invoices</a>
        <p>Loading invoice…</p>
      </main>
    );
  }

  const seller = (invoice.sellerSnapshot ?? {}) as Record<string, string>;
  const customer = (invoice.customerSnapshot ?? {}) as Record<string, unknown>;
  const address = (customer.address ?? {}) as Record<string, string>;
  const isPaid = invoice.status === "PAID";

  return (
    <main style={{ padding: "40px", maxWidth: "860px", margin: "0 auto", display: "grid", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/admin/invoices">← Back to invoices</a>
        <div style={{ display: "flex", gap: "10px" }}>
          {!isPaid ? (
            <button type="button" onClick={markPaid} style={btnStyle("green")}>
              Mark as Paid
            </button>
          ) : (
            <button type="button" onClick={markUnpaid} style={btnStyle("orange")}>
              Mark as Unpaid
            </button>
          )}
        </div>
      </div>
      {message ? <p style={{ color: "green" }}>{message}</p> : null}

      <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "32px", background: "#fff", display: "grid", gap: "20px" }}>
        {/* Seller address block (German standard: seller top-left) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>Von (Verkäufer)</strong>
            <div style={{ lineHeight: "1.7", color: "#444" }}>
              {seller.name && <div>{seller.name}</div>}
              {seller.addressLine1 && <div>{seller.addressLine1}</div>}
              {(seller.postalCode || seller.city) && <div>{[seller.postalCode, seller.city].filter(Boolean).join(" ")}</div>}
              {seller.countryCode && <div>{seller.countryCode}</div>}
              {seller.vatId && <div>USt-IdNr.: {seller.vatId}</div>}
              {seller.email && <div>{seller.email}</div>}
              {seller.phone && <div>{seller.phone}</div>}
            </div>
          </div>
          <div>
            <strong style={{ display: "block", marginBottom: "4px" }}>An (Käufer)</strong>
            <div style={{ lineHeight: "1.7", color: "#444" }}>
              {((customer.companyName as string) || (customer.name as string)) && (
                <div>{(customer.companyName as string) || (customer.name as string)}</div>
              )}
              {address.line1 && <div>{address.line1}</div>}
              {(address.postalCode || address.city) && <div>{[address.postalCode, address.city].filter(Boolean).join(" ")}</div>}
              {(customer.countryCode as string) && <div>{customer.countryCode as string}</div>}
              {(customer.vatId as string) && <div>USt-IdNr.: {customer.vatId as string}</div>}
              {(customer.email as string) && <div>{customer.email as string}</div>}
            </div>
          </div>
        </div>

        <hr />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>Rechnung {invoice.invoiceNumber}</h2>
            <div style={{ color: "#666", fontSize: "0.9rem" }}>
              <div>Ausgestellt: {dateLabel(invoice.issuedAt)}</div>
              <div>Fällig: {dateLabel(invoice.dueAt)}</div>
              {invoice.paidAt ? <div>Bezahlt: {dateLabel(invoice.paidAt)}</div> : null}
            </div>
          </div>
          <span style={{ padding: "4px 12px", borderRadius: "999px", background: isPaid ? "#d1fae5" : "#fef3c7", color: isPaid ? "#065f46" : "#92400e", fontWeight: 700 }}>
            {invoice.status}
          </span>
        </div>

        {/* Client summary */}
        {invoice.user ? (
          <div style={{ background: "#f9fafb", borderRadius: "8px", padding: "14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div>
              <div style={{ color: "#888", fontSize: "0.8rem" }}>Client</div>
              <a href={`/admin/clients/${invoice.user.id}`} style={{ fontWeight: 700 }}>{invoice.user.name || invoice.user.email}</a>
            </div>
            <div>
              <div style={{ color: "#888", fontSize: "0.8rem" }}>Services</div>
              <strong>{invoice.user.services?.length ?? 0}</strong>
            </div>
            <div>
              <div style={{ color: "#888", fontSize: "0.8rem" }}>Domains</div>
              <strong>{invoice.user.domainRecords?.length ?? 0}</strong>
            </div>
          </div>
        ) : null}

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee" }}>
              <th style={thStyle}>Beschreibung</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Menge</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Einzelpreis</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Summe</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item) => (
              <tr key={item.description} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={tdStyle}>{item.description}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{item.quantity}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{money(item.unitAmountCents, invoice.currency)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{money(item.totalCents, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "grid", justifyContent: "end", gap: "6px", textAlign: "right" }}>
          <div>Zwischensumme: {money(invoice.subtotalCents ?? invoice.totalCents, invoice.currency)}</div>
          {(invoice.taxAmountCents ?? 0) > 0 ? <div>USt.: {money(invoice.taxAmountCents ?? 0, invoice.currency)}</div> : null}
          <strong style={{ fontSize: "1.1rem" }}>Gesamt: {money(invoice.totalCents, invoice.currency)}</strong>
        </div>

        {(invoice.footerLines ?? []).length > 0 ? (
          <div style={{ borderTop: "1px solid #eee", paddingTop: "14px", color: "#888", fontSize: "0.8rem", display: "grid", gap: "4px" }}>
            {(invoice.footerLines ?? []).map((line) => <span key={line}>{line}</span>)}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

const thStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#555" };
const tdStyle: React.CSSProperties = { padding: "10px 12px" };

function btnStyle(color: "green" | "orange"): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    background: color === "green" ? "#059669" : "#d97706",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer"
  };
}
