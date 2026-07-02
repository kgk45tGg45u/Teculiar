"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, FileText, Image as ImageIcon, Send } from "lucide-react";
import { API_BASE_URL, authHeaders, type ApiKnowledgebaseArticle, type ApiTicket } from "@dezhost/web-core/lib/api";
import { useLocale } from "@dezhost/web-core/components/layout/locale-provider";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { TICKET_STATUS_VALUES, ticketStatusLabel, ticketStatusTone } from "@dezhost/web-core/lib/status-labels";
import { InvoiceModal } from "../tickets/invoice-modal";
import { TicketConversation } from "../tickets/ticket-conversation";
import { Button } from "@dezhost/web-core/components/ui/button";
import { StatusPill } from "@dezhost/web-core/components/ui/status-pill";
import { notifyResponse } from "@dezhost/web-core/components/ui/toast-provider";
import styles from "./admin-dashboard.module.css";

export function KnowledgebasePanel({ articles: initialArticles }: { articles: ApiKnowledgebaseArticle[] }) {
  const a = getDictionary(useLocale()).admin;
  const c = a.support;
  const [articles, setArticles] = useState(initialArticles);
  const [editing, setEditing] = useState<ApiKnowledgebaseArticle>();
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const payload = {
      body: String(formData.get("body") ?? ""),
      excerpt: String(formData.get("excerpt") ?? ""),
      keywords: String(formData.get("keywords") ?? "").split(",").map((keyword) => keyword.trim()).filter(Boolean),
      published: formData.get("published") === "on",
      seoDescription: String(formData.get("seoDescription") ?? ""),
      seoTitle: String(formData.get("seoTitle") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      title: String(formData.get("title") ?? "")
    };
    const response = await fetch(`${API_BASE_URL}/admin/dev/knowledgebase${id ? `/${id}` : ""}`, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: id ? "PATCH" : "POST"
    });
    const article = await response.clone().json().catch(() => undefined) as ApiKnowledgebaseArticle | undefined;
    if (response.ok && article) {
      setArticles((items) => id ? items.map((item) => item.id === article.id ? article : item) : [article, ...items]);
      setEditing(undefined);
    }
    setMessage(await notifyResponse(response, c.articleSaved, c.articleFailed));
  }

  async function remove(article: ApiKnowledgebaseArticle) {
    const response = await fetch(`${API_BASE_URL}/admin/dev/knowledgebase/${article.id}`, { headers: authHeaders("admin"), method: "DELETE" });
    if (response.ok) {
      setArticles((items) => items.filter((item) => item.id !== article.id));
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">{a.knowledgebase}</span>
          <h2>{c.articles}</h2>
        </div>
        <Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>{c.newArticle}</Button>
      </div>
      <form action={save} className={styles.form} key={editing?.id ?? "new-kb"}>
        <input name="id" type="hidden" value={editing?.id ?? ""} />
        <label>{c.title}<input defaultValue={editing?.title ?? ""} name="title" required /></label>
        <label>{c.slug}<input defaultValue={editing?.slug ?? ""} name="slug" placeholder="control-panel-login" /></label>
        <label>{c.excerpt}<textarea defaultValue={editing?.excerpt ?? ""} name="excerpt" rows={2} /></label>
        <label>{c.content}<textarea defaultValue={editing?.body ?? ""} name="body" required rows={10} /></label>
        <label>{c.keywords}<input defaultValue={(editing?.keywords ?? []).join(", ")} name="keywords" placeholder="domain, dns, hosting" /></label>
        <label>{c.seoTitle}<input defaultValue={editing?.seoTitle ?? ""} name="seoTitle" /></label>
        <label>{c.seoDescription}<textarea defaultValue={editing?.seoDescription ?? ""} name="seoDescription" rows={2} /></label>
        <label className={styles.inlineForm}><input defaultChecked={editing?.published ?? true} name="published" type="checkbox" /> {c.public}</label>
        <Button icon={BookOpen} type="submit">{c.saveArticle}</Button>
        {message ? <p>{message}</p> : null}
      </form>
      <table className="table">
        <thead><tr><th>{c.title}</th><th>{c.slug}</th><th>{c.public}</th><th></th></tr></thead>
        <tbody>{articles.map((article) => (
          <tr key={article.id}>
            <td>{article.title}</td>
            <td>{article.slug}</td>
            <td>{article.published ? c.yes : c.no}</td>
            <td className={styles.inlineForm}><Button type="button" variant="secondary" onClick={() => setEditing(article)}>{c.edit}</Button><Button type="button" variant="secondary" onClick={() => void remove(article)}>{c.delete}</Button></td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

export function AdminTicketThread({ articles, initialTicket }: { articles: ApiKnowledgebaseArticle[]; initialTicket: ApiTicket }) {
  const locale = useLocale();
  const c = getDictionary(locale).admin.support;
  const [ticket, setTicket] = useState(initialTicket);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    const refreshed = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, { headers: authHeaders("admin") })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    if (refreshed) setTicket(refreshed);
  }

  async function reply() {
    if (!body.trim() && files.length === 0) return;
    const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/replies`, {
      body: JSON.stringify({ body }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    const created = await response.clone().json().catch(() => undefined) as { id?: string } | undefined;
    if (response.ok) {
      if (files.length > 0) {
        const form = new FormData();
        files.forEach((file) => form.append("files", file));
        if (created?.id) form.append("replyId", created.id);
        await fetch(`${API_BASE_URL}/tickets/${ticket.id}/attachments`, { body: form, headers: authHeaders("admin"), method: "POST" }).catch(() => undefined);
      }
      await refresh();
      setBody("");
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    }
    setMessage(await notifyResponse(response, c.replySent, c.replyFailed));
  }

  async function statusChange(status: string) {
    const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/status`, {
      body: JSON.stringify({ status }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "PATCH"
    });
    const updated = await response.clone().json().catch(() => undefined) as ApiTicket | undefined;
    if (response.ok && updated) setTicket({ ...ticket, status: updated.status, updatedAt: updated.updatedAt });
  }

  function insertArticle(id: string) {
    const article = articles.find((item) => item.id === id);
    if (article) {
      setBody((current) => `${current}${current ? "\n\n" : ""}${stripHtml(article.body)}`);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <span className="eyebrow">#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()} · {ticket.department?.name ?? ""}</span>
          <h2>{ticket.subject}</h2>
        </div>
        <div className={styles.ticketHeaderControls}>
          <StatusPill label={ticketStatusLabel(ticket.status, locale)} tone={ticketStatusTone(ticket.status)} />
          <select aria-label={c.ticketStatusAria} defaultValue={ticket.status} onChange={(event) => void statusChange(event.target.value)}>
            {TICKET_STATUS_VALUES.map((status) => <option key={status} value={status}>{ticketStatusLabel(status, locale)}</option>)}
          </select>
        </div>
      </div>

      <TicketConversation perspective="staff" ticket={ticket} />

      {ticket.status !== "CLOSED" ? (
        <div className={styles.ticketComposer}>
          <div className={styles.ticketComposerTools}>
            <select aria-label={c.insertArticleAria} defaultValue="" onChange={(event) => { insertArticle(event.target.value); event.target.value = ""; }}>
              <option value="">{c.insertArticle}</option>
              {articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}
            </select>
            <button className={styles.ticketToolBtn} onClick={() => fileInput.current?.click()} type="button"><ImageIcon size={15} /> {c.attachFile}{files.length ? ` (${files.length})` : ""}</button>
            <button className={styles.ticketToolBtn} onClick={() => setInvoiceOpen(true)} type="button"><FileText size={15} /> {c.insertInvoice}</button>
            <input accept="image/png,image/jpeg,image/webp,application/pdf" hidden multiple ref={fileInput} type="file" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
          </div>
          {files.length ? <div className={styles.ticketFileChips}>{files.map((file) => <span className={styles.ticketFileChip} key={file.name}>{file.name}</span>)}</div> : null}
          <div className={styles.ticketComposerRow}>
            <textarea className={styles.ticketComposerInput} onChange={(event) => setBody(event.target.value)} placeholder={c.messagePlaceholder} rows={2} value={body} />
            <Button icon={Send} type="button" onClick={() => void reply()}>{c.send}</Button>
          </div>
          <p className={styles.ticketFileHint}>{c.attachHint}</p>
          {message ? <p>{message}</p> : null}
        </div>
      ) : (
        <p className={styles.ticketClosedNote}>{c.ticketClosed}</p>
      )}

      {invoiceOpen ? <InvoiceModal onClose={() => setInvoiceOpen(false)} onCreated={() => void refresh()} ticket={ticket} /> : null}
    </section>
  );
}

// Client wrapper so the ticket thread renders inside the admin dashboard layout
// (with the sidebar) — fetches the ticket + canned articles, then renders the thread.
export function AdminTicketDetail({ ticketId }: { ticketId: string }) {
  const c = getDictionary(useLocale()).admin.support;
  const [ticket, setTicket] = useState<ApiTicket | null>(null);
  const [articles, setArticles] = useState<ApiKnowledgebaseArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`${API_BASE_URL}/tickets/${ticketId}`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API_BASE_URL}/admin/dev/knowledgebase`, { headers: authHeaders("admin") }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
    ]).then(([loadedTicket, loadedArticles]) => {
      if (!active) return;
      setTicket(loadedTicket);
      setArticles(Array.isArray(loadedArticles) ? loadedArticles : []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [ticketId]);

  if (loading) {
    return <section className={styles.panel}><p className={styles.formMessage}>{c.loadingTicket}</p></section>;
  }
  if (!ticket) {
    return <section className={styles.panel}><p className={styles.formMessage}>{c.ticketNotFound} <a href="/admin/tickets">{c.backToTickets}</a></p></section>;
  }

  return (
    <>
      <div className={styles.inlineForm}><a href="/admin/tickets">{c.backToTicketsArrow}</a></div>
      <AdminTicketThread articles={articles} initialTicket={ticket} />
    </>
  );
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
