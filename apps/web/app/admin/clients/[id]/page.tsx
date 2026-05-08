"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL, authHeaders, money } from "../../../../lib/api";

type ClientDetail = {
  id: string;
  name: string;
  email: string;
  countryCode: string;
  customerType: string;
  vatId?: string | null;
  createdAt: string;
  services: Array<{ id: string; status: string; product: { name: string; type: string }; productPrice: { amountCents: number; billingCycle: string; currency: string } }>;
  domainRecords: Array<{ id: string; domain: string; status: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; totalCents: number; issuedAt: string; dueAt: string }>;
};

type InvoiceLine = { description: string; quantity: number; unitAmountCents: number };

export default function AdminClientPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [message, setMessage] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: "", quantity: 1, unitAmountCents: 0 }]);
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/dev/clients/${params.id}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setClient(data))
      .catch(() => undefined);
  }, [params.id]);

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: 1, unitAmountCents: 0 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof InvoiceLine, value: string | number) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }

  async function createInvoice() {
    setCreating(true);
    setMessage("");
    const r = await fetch(`${API_BASE_URL}/admin/dev/billing/clients/${params.id}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ dueAt, lines, notes: notes || undefined })
    });
    setCreating(false);
    if (r.ok) {
      const data = await r.json();
      setMessage(`Invoice ${data.invoiceNumber} created.`);
      // Reload client to show new invoice
      fetch(`${API_BASE_URL}/admin/dev/clients/${params.id}`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setClient(data))
        .catch(() => undefined);
      setLines([{ description: "", quantity: 1, unitAmountCents: 0 }]);
      setNotes("");
    } else {
      setMessage("Failed to create invoice.");
    }
  }

  if (!client) {
    return (
      <main style={{ padding: "40px" }}>
        <a href="/admin/clients">← Back to clients</a>
        <p>Loading client…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "40px", maxWidth: "960px", margin: "0 auto", display: "grid", gap: "28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/admin/clients">← Back to clients</a>
      </div>

      {/* Client info */}
      <section style={cardStyle}>
        <h2 style={{ margin: "0 0 16px" }}>{client.name}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          <Info label="Email" value={client.email} />
          <Info label="Country" value={client.countryCode} />
          <Info label="Type" value={client.customerType} />
          <Info label="VAT ID" value={client.vatId ?? "-"} />
          <Info label="Services" value={String(client.services.length)} />
          <Info label="Domains" value={String(client.domainRecords.length)} />
        </div>
      </section>

      {/* Services */}
      <section style={cardStyle}>
        <h3 style={{ margin: "0 0 12px" }}>Services ({client.services.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee" }}>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {client.services.length ? client.services.map((svc) => (
              <tr key={svc.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={tdStyle}>{svc.product.name}</td>
                <td style={tdStyle}>{svc.product.type}</td>
                <td style={tdStyle}>{money(svc.productPrice.amountCents, svc.productPrice.currency)} / {svc.productPrice.billingCycle}</td>
                <td style={tdStyle}><StatusBadge status={svc.status} /></td>
              </tr>
            )) : <tr><td colSpan={4} style={tdStyle}>No services.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Domains */}
      {client.domainRecords.length > 0 ? (
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px" }}>Domains ({client.domainRecords.length})</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #eee" }}>
                <th style={thStyle}>Domain</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {client.domainRecords.map((d) => (
                <tr key={d.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={tdStyle}>{d.domain}</td>
                  <td style={tdStyle}><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Invoices */}
      <section style={cardStyle}>
        <h3 style={{ margin: "0 0 12px" }}>Invoices ({client.invoices.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee" }}>
              <th style={thStyle}>Invoice #</th>
              <th style={thStyle}>Issued</th>
              <th style={thStyle}>Due</th>
              <th style={thStyle}>Total</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {client.invoices.length ? client.invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={tdStyle}><a href={`/admin/invoices/${inv.id}`}>{inv.invoiceNumber}</a></td>
                <td style={tdStyle}>{dateLabel(inv.issuedAt)}</td>
                <td style={tdStyle}>{dateLabel(inv.dueAt)}</td>
                <td style={tdStyle}>{money(inv.totalCents, "EUR")}</td>
                <td style={tdStyle}><StatusBadge status={inv.status} /></td>
              </tr>
            )) : <tr><td colSpan={5} style={tdStyle}>No invoices.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Create custom invoice */}
      <section style={cardStyle}>
        <h3 style={{ margin: "0 0 16px" }}>Create Custom Invoice</h3>
        <p style={{ color: "#666", margin: "0 0 16px", fontSize: "0.9rem" }}>
          VAT is calculated automatically using the rate configured in Settings. The invoice will appear in the client portal.
        </p>

        <div style={{ display: "grid", gap: "12px" }}>
          {lines.map((line, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 80px 120px auto", gap: "8px", alignItems: "end" }}>
              <label style={labelStyle}>
                Description
                <input
                  className="input"
                  value={line.description}
                  onChange={(e) => updateLine(index, "description", e.target.value)}
                  placeholder="Service description"
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Qty
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, "quantity", Number(e.target.value))}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                Price (cents)
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={line.unitAmountCents}
                  onChange={(e) => updateLine(index, "unitAmountCents", Number(e.target.value))}
                  placeholder="e.g. 1999"
                  style={inputStyle}
                />
              </label>
              {lines.length > 1 ? (
                <button type="button" onClick={() => removeLine(index)} style={{ ...btnStyle2, background: "#fee2e2", color: "#b91c1c" }}>
                  ✕
                </button>
              ) : <div />}
            </div>
          ))}

          <button type="button" onClick={addLine} style={{ ...btnStyle2, justifySelf: "start" }}>
            + Add line
          </button>

          <label style={labelStyle}>
            Due date
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Notes (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes"
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>

          <button
            type="button"
            onClick={createInvoice}
            disabled={creating || lines.some((l) => !l.description)}
            style={{ ...btnStyle2, background: "#059669", color: "#fff", justifySelf: "start", padding: "10px 20px" }}
          >
            {creating ? "Creating…" : "Create Invoice"}
          </button>

          {message ? <p style={{ color: message.includes("created") ? "green" : "red", margin: 0 }}>{message}</p> : null}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px", border: "1px solid #eee", borderRadius: "6px" }}>
      <div style={{ color: "#888", fontSize: "0.8rem", marginBottom: "4px" }}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const good = ["ACTIVE", "PAID", "REGISTERED"].includes(status);
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: "999px",
      background: good ? "#d1fae5" : "#fef3c7",
      color: good ? "#065f46" : "#92400e",
      fontWeight: 700,
      fontSize: "0.8rem"
    }}>
      {status.toLowerCase()}
    </span>
  );
}

function dateLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value)) : "-";
}

const cardStyle: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: "8px", padding: "24px", background: "#fff" };
const thStyle: React.CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#555" };
const tdStyle: React.CSSProperties = { padding: "10px 12px" };
const labelStyle: React.CSSProperties = { display: "grid", gap: "4px", fontSize: "0.85rem", fontWeight: 600, color: "#555" };
const inputStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.9rem", width: "100%" };
const btnStyle2: React.CSSProperties = { padding: "8px 14px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" };
