"use client";

import { Bot, Edit2, Plus, Power, PowerOff, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiBlogCategory, type ApiBlogPost, type ApiBlogTag } from "../../lib/api";
import { Button } from "../ui/button";
import { notify, notifyResponse } from "../ui/toast-provider";
import { ImageUploader } from "../ui/image-uploader";
import { RichTextEditor } from "./admin-forms";
import styles from "./admin-dashboard.module.css";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  return res.json() as Promise<T>;
}

// ── BlogPostList ─────────────────────────────────────────────────────────────

export function BlogPostList() {
  const [posts, setPosts] = useState<ApiBlogPost[]>([]);
  const [busy, setBusy] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  async function refresh() {
    const data = await fetchJson<ApiBlogPost[]>("/cms/admin/dev/posts").catch(() => []);
    setPosts(Array.isArray(data) ? data : []);
  }

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [openMenu]);

  async function unpublish(post: ApiBlogPost) {
    setBusy(true);
    const res = await fetch(`${API_BASE_URL}/cms/pages/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content: { ...(post.content ?? {}), published: false } })
    });
    res.ok ? notify.success("Unpublished.") : notify.error("Failed to unpublish.");
    if (res.ok) await refresh();
    setBusy(false);
  }

  async function remove(post: ApiBlogPost) {
    if (!window.confirm(`Delete "${post.title}"?`)) return;
    setBusy(true);
    const res = await fetch(`${API_BASE_URL}/cms/pages/${post.id}`, { method: "DELETE", headers: authHeaders() });
    res.ok ? notify.success("Deleted.") : notify.error("Failed to delete.");
    if (res.ok) await refresh();
    setBusy(false);
  }

  const isAi = (post: ApiBlogPost) => post.content?.postType === "ai_generated";

  if (!posts.length) {
    return (
      <div className={styles.blogTable}>
        <p style={{ padding: "24px 16px", color: "var(--muted)", fontSize: 13, margin: 0 }}>
          No blog posts yet. <a href="/admin/blog/new">Write the first one →</a>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.blogTable}>
      <div className={styles.blogTableHead}>
        <div className={styles.blogTableCell}>Title</div>
        <div className={styles.blogTableCell} style={{ textAlign: "center" }}>Lang</div>
        <div className={styles.blogTableCell} style={{ textAlign: "center" }}>Status</div>
        <div className={styles.blogTableCell} style={{ textAlign: "right" }}>Actions</div>
      </div>
      {posts.map((post) => {
        const cats = post.categories ?? (post.category ? [post.category] : []);
        return (
          <div key={post.id} className={styles.blogTableRow}>
            {/* Title */}
            <div className={styles.blogTableCell} style={{ minWidth: 0 }}>
              <a
                href={`/${post.locale}/blog/${post.slug}`}
                target="_blank"
                rel="noreferrer"
                className={styles.postTitle}
              >
                {post.title}
                {isAi(post) && <span className={styles.aiBadge}><Bot size={9} aria-hidden /> AI</span>}
              </a>
              {cats.length > 0 && (
                <div className={styles.postMeta}>{cats.slice(0, 2).join(", ")}</div>
              )}
            </div>
            {/* Locale */}
            <div className={styles.blogTableCell} style={{ textAlign: "center" }}>
              <span className={styles.statusBadge} style={{ background: "var(--surface-2, #f0f0f0)", color: "var(--muted)" }}>
                {post.locale.toUpperCase()}
              </span>
            </div>
            {/* Status */}
            <div className={styles.blogTableCell} style={{ textAlign: "center" }}>
              <span className={`${styles.statusBadge} ${post.publishedAt ? styles.statusPublished : styles.statusDraft}`}>
                {post.publishedAt ? "Live" : "Draft"}
              </span>
            </div>
            {/* Actions */}
            <div className={styles.blogTableCell} style={{ textAlign: "right" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => setOpenMenu(openMenu === post.id ? null : post.id)}
                  aria-label="Actions"
                >
                  ···
                </button>
                {openMenu === post.id && (
                  <div className={styles.actionsMenu}>
                    <a href={`/admin/blog/new?edit=${post.id}`} className={styles.actionsMenuItem}>Edit</a>
                    <a href={`/${post.locale}/blog/${post.slug}`} target="_blank" rel="noreferrer" className={styles.actionsMenuItem}>View</a>
                    {post.publishedAt && (
                      <button type="button" className={styles.actionsMenuItem} disabled={busy} onClick={() => { setOpenMenu(null); void unpublish(post); }}>Unpublish</button>
                    )}
                    <button type="button" className={`${styles.actionsMenuItem} ${styles.actionsMenuItemDanger}`} disabled={busy} onClick={() => { setOpenMenu(null); void remove(post); }}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── BlogPostForm ─────────────────────────────────────────────────────────────

export function BlogPostForm({ editId }: { editId?: string }) {
  const [editing, setEditing] = useState<ApiBlogPost | null>(null);
  const [locale, setLocale] = useState<"de" | "en">("de");
  const [categories, setCategories] = useState<ApiBlogCategory[]>([]);
  const [tags, setTags] = useState<ApiBlogTag[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [featureImage, setFeatureImage] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [message, setMessage] = useState("");

  async function loadCatsAndTags(loc: string) {
    const [cats, tgs] = await Promise.all([
      fetchJson<ApiBlogCategory[]>(`/cms/blog-categories?locale=${loc}`).catch(() => []),
      fetchJson<ApiBlogTag[]>(`/cms/blog-tags?locale=${loc}`).catch(() => [])
    ]);
    setCategories(Array.isArray(cats) ? cats : []);
    setTags(Array.isArray(tgs) ? tgs : []);
    // Clear selections that no longer exist for this locale
    setSelectedCatIds((prev) => prev.filter((id) => (Array.isArray(cats) ? cats : []).some((c) => c.id === id)));
    setSelectedTagIds((prev) => prev.filter((id) => (Array.isArray(tgs) ? tgs : []).some((t) => t.id === id)));
  }

  async function loadPost(id: string) {
    const posts = await fetchJson<ApiBlogPost[]>("/cms/admin/dev/posts").catch(() => []);
    const post = Array.isArray(posts) ? posts.find((p) => p.id === id) : null;
    if (post) {
      const postLocale = (post.locale === "en" ? "en" : "de") as "de" | "en";
      setEditing(post);
      setLocale(postLocale);
      setSelectedCatIds(post.categoryIds ?? []);
      setSelectedTagIds(post.tagIds ?? []);
      setFeatureImage(post.featureImage ?? post.content?.featureImage ?? "");
      await loadCatsAndTags(postLocale);
    }
  }

  useEffect(() => {
    if (editId) {
      void loadPost(editId);
    } else {
      void loadCatsAndTags("de");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function handleLocaleChange(newLocale: "de" | "en") {
    setLocale(newLocale);
    setSelectedCatIds([]);
    setSelectedTagIds([]);
    setNewCatName("");
    setNewTagName("");
    void loadCatsAndTags(newLocale);
  }

  async function addQuickCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, locale })
    });
    if (res.ok) {
      const cat = await res.json() as ApiBlogCategory;
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCatIds((prev) => [...prev, cat.id]);
      setNewCatName("");
    }
  }

  async function addQuickTag() {
    const name = newTagName.trim();
    if (!name) return;
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setSelectedTagIds((prev) => prev.includes(existing.id) ? prev : [...prev, existing.id]);
      setNewTagName("");
      return;
    }
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, locale })
    });
    if (res.ok) {
      const tag = await res.json() as ApiBlogTag;
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedTagIds((prev) => [...prev, tag.id]);
      setNewTagName("");
    }
  }

  function toggleCategory(id: string) {
    setSelectedCatIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "");
    const body = String(formData.get("content") ?? "");
    const imageUrl = featureImage.trim();
    const isPublished = formData.get("published") === "on";

    const selectedCategories = categories.filter((c) => selectedCatIds.includes(c.id));

    const payload = {
      categoryIds: selectedCatIds,
      content: {
        body,
        category: selectedCategories[0]?.name ?? "",
        featureImage: imageUrl,
        images: imageUrl ? [imageUrl] : [],
        postType: "manual",
        published: isPublished,
        tags: tags.filter((t) => selectedTagIds.includes(t.id)).map((t) => t.name)
      },
      excerpt: String(formData.get("excerpt") ?? ""),
      locale: String(formData.get("locale") ?? "de"),
      seoDescription: String(formData.get("seoDescription") ?? ""),
      seoTitle: String(formData.get("seoTitle") ?? title),
      slug: String(formData.get("slug") || slugify(title)),
      tagIds: selectedTagIds,
      title,
      type: "POST"
    };

    const res = await fetch(`${API_BASE_URL}/cms/${editing ? `pages/${editing.id}` : "posts"}`, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload)
    });

    setMessage(await notifyResponse(res, "Article saved.", "Failed to save article."));
    if (res.ok && !editing) {
      window.location.href = "/admin/blog";
    }
  }

  const isPublished = editing ? Boolean(editing.publishedAt ?? editing.content?.published) : true;

  return (
    <form action={submit} className={styles.form}>
      {/* ── Core fields ── */}
      <label>
        Title
        <input defaultValue={editing?.title ?? ""} name="title" required placeholder="e.g. 10 Tips for Faster Hosting" autoFocus={!editId} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 10 }}>
        <label>
          Slug
          <input defaultValue={editing?.slug ?? ""} name="slug" placeholder="auto-generated" />
        </label>
        <label>
          Locale
          <select
            name="locale"
            value={locale}
            onChange={(e) => handleLocaleChange(e.target.value as "de" | "en")}
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
        </label>
        <label style={{ justifyContent: "flex-end", paddingTop: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4, display: "block" }}>Live</span>
          <input defaultChecked={isPublished} name="published" type="checkbox" style={{ width: 18, height: 18, cursor: "pointer" }} />
        </label>
      </div>

      <label>
        Excerpt
        <input defaultValue={editing?.excerpt ?? ""} name="excerpt" placeholder="One or two sentences — shown in blog listings" />
      </label>

      {/* ── Feature image ── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "end" }}>
        <ImageUploader
          accept="image/png,image/jpeg,image/webp"
          action={`${API_BASE_URL}/cms/admin/dev/blog-assets`}
          headers={authHeaders()}
          label="Feature image"
          onUploaded={(payload) => setFeatureImage(String(payload.imageUrl ?? ""))}
          previewUrl={featureImage}
        />
        <label>
          Image URL
          <input name="featureImage" value={featureImage} onChange={(e) => setFeatureImage(e.target.value)} placeholder="https://... or upload →" />
        </label>
      </div>

      {/* ── Categories & Tags ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)", display: "block", marginBottom: 6 }}>Categories</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, minHeight: 28, marginBottom: 7 }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={selectedCatIds.includes(cat.id) ? styles.chipBlueActive : styles.chipBlue}
              >
                {cat.name}
              </button>
            ))}
            {!categories.length && <span style={{ fontSize: 12, color: "var(--muted)" }}>None yet</span>}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addQuickCategory(); } }}
              placeholder="Add category…"
              style={{ flex: 1, fontSize: 12 }}
            />
            <button type="button" className={styles.rowBtn} onClick={() => void addQuickCategory()}>Add</button>
          </div>
        </div>

        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)", display: "block", marginBottom: 6 }}>Tags</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, minHeight: 28, marginBottom: 7 }}>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={selectedTagIds.includes(tag.id) ? styles.chipOrangeActive : styles.chipOrange}
              >
                {tag.name}
              </button>
            ))}
            {!tags.length && <span style={{ fontSize: 12, color: "var(--muted)" }}>None yet</span>}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addQuickTag(); } }}
              placeholder="Add tag…"
              style={{ flex: 1, fontSize: 12 }}
            />
            <button type="button" className={styles.rowBtn} onClick={() => void addQuickTag()}>Add</button>
          </div>
        </div>
      </div>

      {/* ── SEO (collapsed into small fields) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          SEO Title
          <input defaultValue={editing?.seoTitle ?? ""} name="seoTitle" placeholder="Defaults to title" />
        </label>
        <label>
          SEO Description
          <input defaultValue={editing?.seoDescription ?? ""} name="seoDescription" placeholder="150–160 characters" />
        </label>
      </div>

      {/* ── Body ── */}
      <RichTextEditor initialValue={editing?.content?.body ?? ""} />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button icon={Save} type="submit">{editing ? "Save Changes" : "Publish Article"}</Button>
        {editing && (
          <a href="/admin/blog/new" className={styles.rowBtn} style={{ padding: "6px 14px", fontSize: 13 }}>
            + New Post
          </a>
        )}
      </div>
      {message && <p style={{ fontSize: 13, margin: "4px 0 0", color: "var(--muted)" }}>{message}</p>}
    </form>
  );
}

// ── BlogCategoryTagManager ───────────────────────────────────────────────────

export function BlogCategoryTagManager() {
  const [locale, setLocale] = useState<"de" | "en">("de");
  const [categories, setCategories] = useState<ApiBlogCategory[]>([]);
  const [tags, setTags] = useState<ApiBlogTag[]>([]);
  const [editingCat, setEditingCat] = useState<ApiBlogCategory | null>(null);
  const [editingTag, setEditingTag] = useState<ApiBlogTag | null>(null);
  const [newCat, setNewCat] = useState("");
  const [newTag, setNewTag] = useState("");

  async function refresh(loc = locale) {
    const [cats, tgs] = await Promise.all([
      fetchJson<ApiBlogCategory[]>(`/cms/blog-categories?locale=${loc}`).catch(() => []),
      fetchJson<ApiBlogTag[]>(`/cms/blog-tags?locale=${loc}`).catch(() => [])
    ]);
    setCategories(Array.isArray(cats) ? cats : []);
    setTags(Array.isArray(tgs) ? tgs : []);
  }

  useEffect(() => { void refresh(); }, [locale]);

  async function createCategory() {
    const name = newCat.trim();
    if (!name) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, locale })
    });
    res.ok ? notify.success("Category created.") : notify.error("Failed.");
    if (res.ok) { setNewCat(""); await refresh(); }
  }

  async function updateCategory(id: string, name: string) {
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name })
    });
    res.ok ? notify.success("Category updated.") : notify.error("Failed.");
    if (res.ok) { setEditingCat(null); await refresh(); }
  }

  async function deleteCategory(id: string) {
    if (!window.confirm("Delete this category?")) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-categories/${id}`, { method: "DELETE", headers: authHeaders() });
    res.ok ? notify.success("Deleted.") : notify.error("Failed.");
    if (res.ok) await refresh();
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, locale })
    });
    res.ok ? notify.success("Tag created.") : notify.error("Failed.");
    if (res.ok) { setNewTag(""); await refresh(); }
  }

  async function updateTag(id: string, name: string) {
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name })
    });
    res.ok ? notify.success("Tag updated.") : notify.error("Failed.");
    if (res.ok) { setEditingTag(null); await refresh(); }
  }

  async function deleteTag(id: string) {
    if (!window.confirm("Delete this tag?")) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-tags/${id}`, { method: "DELETE", headers: authHeaders() });
    res.ok ? notify.success("Deleted.") : notify.error("Failed.");
    if (res.ok) await refresh();
  }

  const localeName = locale === "de" ? "German" : "English";

  return (
    <div>
      {/* Locale switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 12 }}>
        {(["de", "en"] as const).map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={() => { setLocale(loc); setEditingCat(null); setEditingTag(null); setNewCat(""); setNewTag(""); }}
            className={locale === loc ? styles.chipBlueActive : styles.chipBlue}
            style={{ fontSize: 13, padding: "4px 14px" }}
          >
            {loc === "de" ? "🇩🇪 German" : "🇬🇧 English"}
          </button>
        ))}
        <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center", marginLeft: 8 }}>
          Managing {localeName} categories and tags
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
        {/* Categories */}
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Categories ({localeName})</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createCategory(); } }}
              placeholder={`New ${localeName} category…`}
              style={{ flex: 1 }}
            />
            <Button type="button" icon={Plus} size="sm" onClick={() => void createCategory()}>Add</Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {categories.map((cat) => (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {editingCat?.id === cat.id ? (
                  <InlineEdit initialValue={cat.name} onSave={(v) => void updateCategory(cat.id, v)} onCancel={() => setEditingCat(null)} />
                ) : (
                  <>
                    <span className={styles.chipBlue} style={{ flex: 1 }}>{cat.name}</span>
                    <button type="button" onClick={() => setEditingCat(cat)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Edit2 size={13} /></button>
                    <button type="button" onClick={() => void deleteCategory(cat.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--danger, #ef4444)" }}><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
            {!categories.length && <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>No {localeName} categories yet.</p>}
          </div>
        </div>

        {/* Tags */}
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>Tags ({localeName})</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createTag(); } }}
              placeholder={`New ${localeName} tag…`}
              style={{ flex: 1 }}
            />
            <Button type="button" icon={Plus} size="sm" onClick={() => void createTag()}>Add</Button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map((tag) => (
              <div key={tag.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {editingTag?.id === tag.id ? (
                  <InlineEdit initialValue={tag.name} onSave={(v) => void updateTag(tag.id, v)} onCancel={() => setEditingTag(null)} />
                ) : (
                  <>
                    <span className={styles.chipOrange}>{tag.name}</span>
                    <button type="button" onClick={() => setEditingTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}><Edit2 size={11} /></button>
                    <button type="button" onClick={() => void deleteTag(tag.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--danger, #ef4444)" }}><Trash2 size={11} /></button>
                  </>
                )}
              </div>
            ))}
            {!tags.length && <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>No {localeName} tags yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineEdit({ initialValue, onSave, onCancel }: { initialValue: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1 }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ flex: 1, fontSize: 13, padding: "2px 6px" }}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(value); if (e.key === "Escape") onCancel(); }}
      />
      <button type="button" onClick={() => onSave(value)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--accent)" }}><Save size={13} /></button>
      <button type="button" onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted)" }}><X size={13} /></button>
    </div>
  );
}

// ── AiContentManager ─────────────────────────────────────────────────────────

type AiSettings = {
  aiBlogEnabled?: boolean;
  aiBlogTopicsPool?: string;
  aiBlogTitlePrompt?: string;
  aiBlogContentPrompt?: string;
  aiBlogExcerptPrompt?: string;
  aiBlogTagsPrompt?: string;
  aiBlogKeywordsPrompt?: string;
  aiBlogWordCount?: number;
  aiBlogLanguage?: string;
};

export function AiContentManager() {
  const [s, setS] = useState<AiSettings>({
    aiBlogEnabled: false,
    aiBlogTopicsPool: "",
    aiBlogTitlePrompt: "",
    aiBlogContentPrompt: "",
    aiBlogExcerptPrompt: "",
    aiBlogTagsPrompt: "",
    aiBlogKeywordsPrompt: "",
    aiBlogWordCount: 800,
    aiBlogLanguage: "de"
  });
  const [message, setMessage] = useState("");
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p: AiSettings) => setS({
        aiBlogEnabled: Boolean(p.aiBlogEnabled),
        aiBlogTopicsPool: p.aiBlogTopicsPool ?? "",
        aiBlogTitlePrompt: p.aiBlogTitlePrompt ?? "",
        aiBlogContentPrompt: p.aiBlogContentPrompt ?? "",
        aiBlogExcerptPrompt: p.aiBlogExcerptPrompt ?? "",
        aiBlogTagsPrompt: p.aiBlogTagsPrompt ?? "",
        aiBlogKeywordsPrompt: p.aiBlogKeywordsPrompt ?? "",
        aiBlogWordCount: p.aiBlogWordCount ?? 800,
        aiBlogLanguage: p.aiBlogLanguage ?? "de"
      }))
      .catch(() => undefined);
  }, []);

  async function toggleEnabled() {
    setToggling(true);
    const next = !s.aiBlogEnabled;
    const res = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ aiBlogEnabled: next })
    });
    if (res.ok) setS((prev) => ({ ...prev, aiBlogEnabled: next }));
    res.ok
      ? notify.success(next ? "AI Content enabled." : "AI Content disabled.")
      : notify.error("Failed.");
    setToggling(false);
  }

  async function submit(formData: FormData) {
    const res = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        aiBlogTopicsPool: String(formData.get("aiBlogTopicsPool") ?? ""),
        aiBlogTitlePrompt: String(formData.get("aiBlogTitlePrompt") ?? ""),
        aiBlogContentPrompt: String(formData.get("aiBlogContentPrompt") ?? ""),
        aiBlogExcerptPrompt: String(formData.get("aiBlogExcerptPrompt") ?? ""),
        aiBlogTagsPrompt: String(formData.get("aiBlogTagsPrompt") ?? ""),
        aiBlogKeywordsPrompt: String(formData.get("aiBlogKeywordsPrompt") ?? ""),
        aiBlogWordCount: Number(formData.get("aiBlogWordCount") ?? 800),
        aiBlogLanguage: String(formData.get("aiBlogLanguage") ?? "de")
      })
    });
    setMessage(await notifyResponse(res, "AI settings saved.", "Failed to save."));
  }

  const isOn = Boolean(s.aiBlogEnabled);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState("");

  async function generateNow() {
    setGenerating(true);
    setGenerateResult("");
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/ai-blog/generate`, {
      method: "POST",
      headers: authHeaders()
    });
    if (res.ok) {
      const data = await res.json() as { id?: string; title?: string };
      const msg = `Generated: "${data.title ?? data.id}"`;
      notify.success(msg);
      setGenerateResult(msg);
    } else {
      const data = await res.json().catch(() => ({})) as { message?: string };
      const msg = data.message ?? "Generation failed — check API logs";
      notify.error(msg);
      setGenerateResult(`Error: ${msg}`);
    }
    setGenerating(false);
  }

  return (
    <div>
      {/* On/Off Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <strong>AI Content Generation</strong>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 0" }}>
            {isOn ? "Running — the cron job will generate articles on schedule." : "Paused — turn on to enable the cron-based schedule."}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={generating} onClick={() => void generateNow()}>
          {generating ? "Generating…" : "Generate Now"}
        </Button>
        <Button
          type="button"
          variant={isOn ? "primary" : "secondary"}
          icon={isOn ? Power : PowerOff}
          disabled={toggling}
          onClick={() => void toggleEnabled()}
        >
          {isOn ? "ON" : "OFF"}
        </Button>
      </div>
      {generateResult && (
        <p style={{ fontSize: 13, padding: "8px 12px", background: "var(--surface-2, #f0f0f0)", borderRadius: 6, marginBottom: 16 }}>
          {generateResult}
        </p>
      )}

      <form action={submit} className={styles.form}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Article language
            <select name="aiBlogLanguage" value={s.aiBlogLanguage} onChange={(e) => setS((p) => ({ ...p, aiBlogLanguage: e.target.value }))}>
              <option value="de">German (+ English translation)</option>
              <option value="en">English (+ German translation)</option>
              <option value="random">Random (DE or EN per article)</option>
            </select>
          </label>
          <label>
            Target word count
            <input name="aiBlogWordCount" type="number" min={200} max={5000} step={100} value={s.aiBlogWordCount} onChange={(e) => setS((p) => ({ ...p, aiBlogWordCount: Number(e.target.value) }))} />
          </label>
        </div>

        <label>
          Topics pool
          <small style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>
            One topic per line. The AI picks one randomly and finds a fresh angle for each article.
          </small>
          <textarea
            name="aiBlogTopicsPool"
            rows={8}
            value={s.aiBlogTopicsPool}
            onChange={(e) => setS((p) => ({ ...p, aiBlogTopicsPool: e.target.value }))}
            placeholder={"Web hosting security\nManaged WordPress hosting\nEmail hosting tips\nDomain name strategy\nSSL certificates explained\nWebsite speed optimization"}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
          />
        </label>

        <h4 style={{ margin: "4px 0 0" }}>Prompt customization</h4>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 8px" }}>
          Leave blank to use sensible defaults. These instructions are appended to the Deepseek system prompt.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            Title guidance
            <input name="aiBlogTitlePrompt" value={s.aiBlogTitlePrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogTitlePrompt: e.target.value }))} placeholder="e.g. Keep titles under 65 chars, include main keyword" />
          </label>
          <label>
            Excerpt guidance
            <input name="aiBlogExcerptPrompt" value={s.aiBlogExcerptPrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogExcerptPrompt: e.target.value }))} placeholder="e.g. 1-2 sentences, conversational tone" />
          </label>
          <label>
            Tags guidance
            <input name="aiBlogTagsPrompt" value={s.aiBlogTagsPrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogTagsPrompt: e.target.value }))} placeholder="e.g. Max 5 tags, lowercase only" />
          </label>
          <label>
            SEO/keywords guidance
            <input name="aiBlogKeywordsPrompt" value={s.aiBlogKeywordsPrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogKeywordsPrompt: e.target.value }))} placeholder="e.g. Target German SME market, include region names" />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Content guidance
            <textarea
              name="aiBlogContentPrompt"
              rows={3}
              value={s.aiBlogContentPrompt}
              onChange={(e) => setS((p) => ({ ...p, aiBlogContentPrompt: e.target.value }))}
              placeholder="e.g. Write for SME owners. Include practical examples. Use subheadings every 300 words. Friendly but professional tone."
              style={{ width: "100%", resize: "vertical" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <Button icon={Save} type="submit">Save Settings</Button>
        </div>
        {message && <p style={{ fontSize: 13, margin: 0 }}>{message}</p>}
      </form>
    </div>
  );
}

// ── AiJobSettingsForm ────────────────────────────────────────────────────────

export function AiJobSettingsForm() {
  const [articlesPerDay, setArticlesPerDay] = useState(3);
  const [intervalHours, setIntervalHours] = useState(8);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`${API_BASE_URL}/admin/dev/billing/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((p: { aiBlogArticlesPerDay?: number; aiBlogIntervalHours?: number }) => {
        setArticlesPerDay(p.aiBlogArticlesPerDay ?? 3);
        setIntervalHours(p.aiBlogIntervalHours ?? 8);
      })
      .catch(() => undefined);
  }, []);

  const totalHours = articlesPerDay * intervalHours;
  const isValid = totalHours <= 24;
  const validationMsg = isValid
    ? `${articlesPerDay} articles × ${intervalHours}h interval = ${totalHours}h total ✓`
    : `${articlesPerDay} × ${intervalHours}h = ${totalHours}h — exceeds 24 hours. Reduce articles or interval.`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const res = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ aiBlogArticlesPerDay: articlesPerDay, aiBlogIntervalHours: intervalHours })
    });
    setMessage(await notifyResponse(res, "Job settings saved.", "Failed to save."));
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={styles.form}>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
        The AI blog job runs each time the main cron executes. It checks if enough time has passed since the last article and whether the daily limit is reached.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
        <label>
          Articles per day
          <input
            type="number"
            min={1}
            max={24}
            value={articlesPerDay}
            onChange={(e) => setArticlesPerDay(Math.max(1, Math.min(24, Number(e.target.value))))}
          />
        </label>
        <label>
          Interval between articles (hours)
          <input
            type="number"
            min={1}
            max={24}
            value={intervalHours}
            onChange={(e) => setIntervalHours(Math.max(1, Math.min(24, Number(e.target.value))))}
          />
        </label>
      </div>

      <p style={{
        fontSize: 13,
        padding: "8px 12px",
        borderRadius: 6,
        background: isValid ? "color-mix(in srgb, #22c55e 12%, transparent)" : "color-mix(in srgb, #ef4444 12%, transparent)",
        color: isValid ? "#16a34a" : "#dc2626",
        margin: 0
      }}>
        {validationMsg}
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <Button icon={Save} type="submit" disabled={!isValid}>Save Job Settings</Button>
      </div>
      {message && <p style={{ fontSize: 13, margin: 0 }}>{message}</p>}
    </form>
  );
}
