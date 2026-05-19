"use client";

import { useState } from "react";
import { BookOpen, Send } from "lucide-react";
import { API_BASE_URL, authHeaders, type ApiKnowledgebaseArticle, type ApiTicket } from "../../lib/api";
import { Button } from "../ui/button";
import { StatusPill } from "../ui/status-pill";
import { notifyResponse } from "../ui/toast-provider";
import styles from "./admin-dashboard.module.css";

export function KnowledgebasePanel({ articles: initialArticles }: { articles: ApiKnowledgebaseArticle[] }) {
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
    setMessage(await notifyResponse(response, "Article saved.", "Article failed."));
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
          <span className="eyebrow">Knowledgebase</span>
          <h2>Articles</h2>
        </div>
        <Button type="button" variant="secondary" onClick={() => setEditing(undefined)}>New Article</Button>
      </div>
      <form action={save} className={styles.form} key={editing?.id ?? "new-kb"}>
        <input name="id" type="hidden" value={editing?.id ?? ""} />
        <label>Title<input defaultValue={editing?.title ?? ""} name="title" required /></label>
        <label>Slug<input defaultValue={editing?.slug ?? ""} name="slug" placeholder="control-panel-login" /></label>
        <label>Excerpt<textarea defaultValue={editing?.excerpt ?? ""} name="excerpt" rows={2} /></label>
        <label>Content<textarea defaultValue={editing?.body ?? ""} name="body" required rows={10} /></label>
        <label>Keywords<input defaultValue={(editing?.keywords ?? []).join(", ")} name="keywords" placeholder="domain, dns, hosting" /></label>
        <label>SEO title<input defaultValue={editing?.seoTitle ?? ""} name="seoTitle" /></label>
        <label>SEO description<textarea defaultValue={editing?.seoDescription ?? ""} name="seoDescription" rows={2} /></label>
        <label className={styles.inlineForm}><input defaultChecked={editing?.published ?? true} name="published" type="checkbox" /> Public</label>
        <Button icon={BookOpen} type="submit">Save Article</Button>
        {message ? <p>{message}</p> : null}
      </form>
      <table className="table">
        <thead><tr><th>Title</th><th>Slug</th><th>Public</th><th></th></tr></thead>
        <tbody>{articles.map((article) => (
          <tr key={article.id}>
            <td>{article.title}</td>
            <td>{article.slug}</td>
            <td>{article.published ? "yes" : "no"}</td>
            <td className={styles.inlineForm}><Button type="button" variant="secondary" onClick={() => setEditing(article)}>Edit</Button><Button type="button" variant="secondary" onClick={() => void remove(article)}>Delete</Button></td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

export function AdminTicketThread({ articles, initialTicket }: { articles: ApiKnowledgebaseArticle[]; initialTicket: ApiTicket }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");

  async function reply() {
    const response = await fetch(`${API_BASE_URL}/tickets/${ticket.id}/replies`, {
      body: JSON.stringify({ body }),
      headers: { "Content-Type": "application/json", ...authHeaders("admin") },
      method: "POST"
    });
    if (response.ok) {
      const refreshed = await fetch(`${API_BASE_URL}/tickets/${ticket.id}`, { headers: authHeaders("admin") }).then((res) => res.ok ? res.json() : null).catch(() => null);
      if (refreshed) setTicket(refreshed);
      setBody("");
    }
    setMessage(await notifyResponse(response, "Reply sent.", "Reply failed."));
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
          <span className="eyebrow">#{ticket.publicId ?? ticket.id.slice(-6).toUpperCase()}</span>
          <h2>{ticket.subject}</h2>
        </div>
        <StatusPill label={ticket.status.toLowerCase()} tone={ticket.status === "CLOSED" ? "neutral" : "warn"} />
      </div>
      <div className={styles.form}>
        <label>Status<select defaultValue={ticket.status} onChange={(event) => void statusChange(event.target.value)}><option value="NEW">New</option><option value="OPEN">Open</option><option value="ANSWERED">Answered</option><option value="CUSTOMER_REPLY">Customer Reply</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label>
        <div className={styles.blogList}>
          {(ticket.replies ?? []).map((reply) => (
            <article key={reply.id}>
              <div><strong>{reply.user?.email ?? "Client"}</strong><span>{dateTimeLabel(reply.createdAt)}</span></div>
              <p>{reply.body}</p>
              <AttachmentLinks files={reply.attachments ?? []} />
            </article>
          ))}
          <AttachmentLinks files={ticket.attachments ?? []} />
        </div>
        <label>Insert article<select defaultValue="" onChange={(event) => insertArticle(event.target.value)}><option value="">Insert article</option>{articles.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label>
        <label>Reply<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={8} /></label>
        <Button icon={Send} type="button" onClick={() => void reply()}>Send Reply</Button>
        {message ? <p>{message}</p> : null}
      </div>
    </section>
  );
}

function AttachmentLinks({ files }: { files: Array<{ fileName: string; id: string; storageKey: string }> }) {
  if (files.length === 0) return null;
  return <div className={styles.inlineForm}>{files.map((file) => <a href={file.storageKey} key={file.id} target="_blank">{file.fileName}</a>)}</div>;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function dateTimeLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}
