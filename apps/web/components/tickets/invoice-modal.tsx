"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { API_BASE_URL, authHeaders, type ApiTicket } from "@dezhost/web-core/lib/api";
import { Button } from "@dezhost/web-core/components/ui/button";
import { notifyResponse } from "@dezhost/web-core/components/ui/toast-provider";
import styles from "./invoice-modal.module.css";

type Line = { description: string; quantity: number; unitAmount: string; vatRate: number };

function defaultDueDate() {
  const due = new Date();
  due.setDate(due.getDate() + 14);
  return due.toISOString().slice(0, 10);
}

// Full invoice editor used from the ticket detail page. Creates an invoice for
// the ticket's client, then posts a styled "invoice created" message into the
// thread linking to it.
export function InvoiceModal({
  onClose,
  onCreated,
  ticket
}: {
  onClose: () => void;
  onCreated: () => void;
  ticket: ApiTicket;
}) {
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: 1, unitAmount: "", vatRate: 19 }]);
  const [dueAt, setDueAt] = useState(defaultDueDate());
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clientId = ticket.user?.id ?? ticket.userId;
  const total = lines.reduce((sum, line) => {
    const net = Math.round(Number(line.unitAmount || 0) * 100) * (line.quantity || 0);
    return sum + net + Math.round((net * (line.vatRate || 0)) / 100);
  }, 0);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function submit() {
    if (!clientId) {
      setMessage("This ticket has no client to invoice.");
      return;
    }
    const items = lines
      .filter((line) => line.description.trim() && Number(line.unitAmount) > 0)
      .map((line) => ({
        description: line.description.trim(),
        quantity: line.quantity,
        unitAmountCents: Math.round(Number(line.unitAmount) * 100),
        vatRate: line.vatRate
      }));
    if (items.length === 0) {
      setMessage("Add at least one line with a description and amount.");
      return;
    }

    setSubmitting(true);
    const createResponse = await fetch(`${API_BASE_URL}/admin/dev/billing/invoices`, {
      body: JSON.stringify({
        userId: clientId,
        dueAt: new Date(dueAt).toISOString(),
        buyerCountryCode: "DE",
        items
      }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    const invoice = await createResponse.clone().json().catch(() => undefined) as { id?: string } | undefined;
    if (!createResponse.ok || !invoice?.id) {
      setMessage(await notifyResponse(createResponse, "Invoice created.", "Invoice failed."));
      setSubmitting(false);
      return;
    }

    const linkResponse = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/invoice-message`, {
      body: JSON.stringify({ invoiceId: invoice.id }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    setMessage(await notifyResponse(linkResponse, "Invoice added to ticket.", "Could not post invoice message."));
    setSubmitting(false);
    if (linkResponse.ok) {
      onCreated();
      onClose();
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog">
        <div className={styles.header}>
          <h3>New invoice for {ticket.user?.name ?? "client"}</h3>
          <button aria-label="Close" className={styles.close} onClick={onClose} type="button"><X size={18} /></button>
        </div>

        <div className={styles.lines}>
          <div className={`${styles.lineRow} ${styles.lineHead}`}>
            <span>Description</span><span>Qty</span><span>Net €</span><span>VAT %</span><span />
          </div>
          {lines.map((line, index) => (
            <div className={styles.lineRow} key={index}>
              <input value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Service / item" />
              <input type="number" min={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} />
              <input type="number" min={0} step="0.01" value={line.unitAmount} onChange={(event) => updateLine(index, { unitAmount: event.target.value })} placeholder="0.00" />
              <input type="number" min={0} value={line.vatRate} onChange={(event) => updateLine(index, { vatRate: Number(event.target.value) })} />
              <button aria-label="Remove line" className={styles.removeLine} onClick={() => setLines((c) => c.filter((_, i) => i !== index))} type="button"><Trash2 size={15} /></button>
            </div>
          ))}
          <button className={styles.addLine} onClick={() => setLines((c) => [...c, { description: "", quantity: 1, unitAmount: "", vatRate: 19 }])} type="button">
            <Plus size={14} /> Add line
          </button>
        </div>

        <div className={styles.footer}>
          <label className={styles.due}>Due date<input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>
          <span className={styles.total}>Total: {(total / 100).toFixed(2)} €</span>
        </div>

        {message ? <p className={styles.message}>{message}</p> : null}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>{submitting ? "Creating…" : "Create invoice"}</Button>
        </div>
      </div>
    </div>
  );
}
