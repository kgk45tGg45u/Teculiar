"use client";

import { FileText, Paperclip } from "lucide-react";
import type { ApiTicket, ApiTicketAttachment, ApiTicketReply } from "@dezhost/web-core/lib/api";
import styles from "./ticket-conversation.module.css";

type Perspective = "staff" | "client";

// WhatsApp-style ticket conversation. "mine" bubbles sit on the right with a
// small avatar; the other party's bubbles sit on the left. Used by both the
// admin thread (perspective="staff") and the client portal (perspective="client").
export function TicketConversation({
  ticket,
  perspective,
  invoiceHref
}: {
  ticket: ApiTicket;
  perspective: Perspective;
  invoiceHref?: (invoiceId: string) => string;
}) {
  const ownerId = ticket.userId ?? ticket.user?.id;
  const replies = (ticket.replies ?? []).filter((reply) => !reply.internal);

  return (
    <div className={styles.chat}>
      {replies.map((reply) => {
        const fromStaff = Boolean(reply.system) || (ownerId ? reply.userId !== ownerId : false);
        const mine = perspective === "staff" ? fromStaff : !fromStaff;
        return <Bubble fromStaff={fromStaff} invoiceHref={invoiceHref} key={reply.id} mine={mine} reply={reply} />;
      })}
      {replies.length === 0 ? <p className={styles.empty}>No messages yet.</p> : null}
    </div>
  );
}

function Bubble({
  fromStaff,
  invoiceHref,
  mine,
  reply
}: {
  fromStaff: boolean;
  invoiceHref?: (invoiceId: string) => string;
  mine: boolean;
  reply: ApiTicketReply;
}) {
  const name = reply.user?.name || (fromStaff ? "Support" : "Guest");
  const isInvoice = Boolean(reply.system && reply.invoice);
  const bubbleClass = [
    styles.bubble,
    mine ? styles.bubbleMine : styles.bubbleTheirs,
    isInvoice ? styles.bubbleInvoice : ""
  ].filter(Boolean).join(" ");

  return (
    <div className={`${styles.row} ${mine ? styles.mine : styles.theirs}`}>
      <Avatar name={name} url={reply.user?.avatarUrl ?? undefined} />
      <div className={bubbleClass}>
        <div className={styles.bubbleTop}>
          <span className={styles.name}>{name}</span>
          <span className={styles.datePill}>{dateTimeLabel(reply.createdAt)}</span>
        </div>
        {isInvoice && reply.invoice ? (
          <InvoiceCard href={invoiceHref?.(reply.invoice.id)} invoice={reply.invoice} />
        ) : (
          <div className={styles.body}>{reply.body}</div>
        )}
        <Attachments files={reply.attachments ?? []} />
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return <span className={styles.avatar} style={{ background: "#e9edf5" }}><img alt={name} src={url} /></span>;
  }
  return (
    <span aria-hidden className={styles.avatar} style={{ background: avatarColor(name) }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function Attachments({ files }: { files: ApiTicketAttachment[] }) {
  if (files.length === 0) {
    return null;
  }
  return (
    <div className={styles.attachments}>
      {files.map((file) =>
        file.mimeType?.startsWith("image/") ? (
          <a className={styles.thumb} href={file.storageKey} key={file.id} target="_blank">
            <img alt={file.fileName} src={file.storageKey} />
          </a>
        ) : (
          <a className={styles.attachment} href={file.storageKey} key={file.id} target="_blank">
            <Paperclip aria-hidden size={13} /> {file.fileName}
          </a>
        )
      )}
    </div>
  );
}

function InvoiceCard({
  href,
  invoice
}: {
  href?: string;
  invoice: NonNullable<ApiTicketReply["invoice"]>;
}) {
  const number = invoice.finalInvoiceNumber ?? invoice.tempInvoiceNumber ?? invoice.invoiceNumber ?? invoice.id;
  return (
    <div className={styles.invoiceCard}>
      <FileText aria-hidden size={18} />
      <div className={styles.invoiceBody}>
        <strong>New invoice created</strong>
        <span>
          {number} · {formatMoney(invoice.totalCents, invoice.currency)}
        </span>
        {href ? (
          <a className={styles.invoiceLink} href={href}>
            View invoice →
          </a>
        ) : null}
      </div>
    </div>
  );
}

function avatarColor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360} 58% 45%)`;
}

function formatMoney(cents: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format((cents ?? 0) / 100);
  } catch {
    return `${((cents ?? 0) / 100).toFixed(2)} ${currency}`;
  }
}

function dateTimeLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "";
}
