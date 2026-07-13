"use client";

import { Bot, Edit2, Plus, Power, PowerOff, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, authHeaders, type ApiBlogCategory, type ApiBlogPost, type ApiBlogTag } from "@teculiar/web-core/lib/api";
import { useLocale } from "@teculiar/web-core/components/layout/locale-provider";
import { getDictionary } from "@teculiar/web-core/lib/dictionary";
import { Button } from "@teculiar/web-core/components/ui/button";
import { notify, notifyResponse } from "@teculiar/web-core/components/ui/toast-provider";
import { ImageUploader } from "@teculiar/web-core/components/ui/image-uploader";
import { RichTextEditor } from "./admin-forms";
import styles from "./admin-dashboard.module.css";
import { useSurfaceHref } from "@teculiar/web-core/lib/use-surface-href";
import { surfaceHref } from "@teculiar/web-core/lib/surface";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  return res.json() as Promise<T>;
}

// ── BlogPostList ─────────────────────────────────────────────────────────────

export function BlogPostList() {
  const href = useSurfaceHref();
  const copy = getDictionary(useLocale()).admin.blogAdmin;
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
    res.ok ? notify.success(copy.unpublished) : notify.error(copy.unpublishFailed);
    if (res.ok) await refresh();
    setBusy(false);
  }

  async function remove(post: ApiBlogPost) {
    if (!window.confirm(copy.confirmDeletePost.replace("{title}", post.title))) return;
    setBusy(true);
    const res = await fetch(`${API_BASE_URL}/cms/pages/${post.id}`, { method: "DELETE", headers: authHeaders() });
    res.ok ? notify.success(copy.deleted) : notify.error(copy.deleteFailed);
    if (res.ok) await refresh();
    setBusy(false);
  }

  const isAi = (post: ApiBlogPost) => post.content?.postType === "ai_generated";

  if (!posts.length) {
    return (
      <div className={styles.blogTable}>
        <p style={{ padding: "24px 16px", color: "var(--muted)", fontSize: 13, margin: 0 }}>
          {copy.emptyList} <a href={href("/admin/blog/new")}>{copy.writeFirst}</a>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.blogTable}>
      <div className={styles.blogTableHead}>
        <div className={styles.blogTableCell}>{copy.colTitle}</div>
        <div className={styles.blogTableCell} style={{ textAlign: "center" }}>{copy.colLang}</div>
        <div className={styles.blogTableCell} style={{ textAlign: "center" }}>{copy.colStatus}</div>
        <div className={styles.blogTableCell} style={{ textAlign: "right" }}>{copy.colActions}</div>
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
                {post.publishedAt ? copy.live : copy.draft}
              </span>
            </div>
            {/* Actions */}
            <div className={styles.blogTableCell} style={{ textAlign: "right" }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                <button
                  type="button"
                  className={styles.rowBtn}
                  onClick={() => setOpenMenu(openMenu === post.id ? null : post.id)}
                  aria-label={copy.actions}
                >
                  ···
                </button>
                {openMenu === post.id && (
                  <div className={styles.actionsMenu}>
                    <a href={href(`/admin/blog/new?edit=${post.id}`)} className={styles.actionsMenuItem}>{copy.edit}</a>
                    <a href={`/${post.locale}/blog/${post.slug}`} target="_blank" rel="noreferrer" className={styles.actionsMenuItem}>{copy.view}</a>
                    {post.publishedAt && (
                      <button type="button" className={styles.actionsMenuItem} disabled={busy} onClick={() => { setOpenMenu(null); void unpublish(post); }}>{copy.unpublish}</button>
                    )}
                    <button type="button" className={`${styles.actionsMenuItem} ${styles.actionsMenuItemDanger}`} disabled={busy} onClick={() => { setOpenMenu(null); void remove(post); }}>{copy.delete}</button>
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
  const href = useSurfaceHref();
  const copy = getDictionary(useLocale()).admin.blogAdmin;
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

    setMessage(await notifyResponse(res, copy.articleSaved, copy.articleSaveFailed));
    if (res.ok && !editing) {
      window.location.href = surfaceHref(window.location.pathname, "/admin/blog");
    }
  }

  const isPublished = editing ? Boolean(editing.publishedAt ?? editing.content?.published) : true;

  return (
    <form action={submit} className={styles.form}>
      {/* ── Core fields ── */}
      <label>
        {copy.title}
        <input defaultValue={editing?.title ?? ""} name="title" required placeholder={copy.titlePlaceholder} autoFocus={!editId} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px", gap: 10 }}>
        <label>
          {copy.slug}
          <input defaultValue={editing?.slug ?? ""} name="slug" placeholder={copy.slugPlaceholder} />
        </label>
        <label>
          {copy.localeField}
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
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4, display: "block" }}>{copy.live}</span>
          <input defaultChecked={isPublished} name="published" type="checkbox" style={{ width: 18, height: 18, cursor: "pointer" }} />
        </label>
      </div>

      <label>
        {copy.excerpt}
        <input defaultValue={editing?.excerpt ?? ""} name="excerpt" placeholder={copy.excerptPlaceholder} />
      </label>

      {/* ── Feature image ── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "end" }}>
        <ImageUploader
          accept="image/png,image/jpeg,image/webp"
          action={`${API_BASE_URL}/cms/admin/dev/blog-assets`}
          headers={authHeaders()}
          label={copy.featureImage}
          onUploaded={(payload) => setFeatureImage(String(payload.imageUrl ?? ""))}
          previewUrl={featureImage}
        />
        <label>
          {copy.imageUrl}
          <input name="featureImage" value={featureImage} onChange={(e) => setFeatureImage(e.target.value)} placeholder={copy.imageUrlPlaceholder} />
        </label>
      </div>

      {/* ── Categories & Tags ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)", display: "block", marginBottom: 6 }}>{copy.categories}</span>
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
            {!categories.length && <span style={{ fontSize: 12, color: "var(--muted)" }}>{copy.noneYet}</span>}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addQuickCategory(); } }}
              placeholder={copy.addCategoryPlaceholder}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button type="button" className={styles.rowBtn} onClick={() => void addQuickCategory()}>{copy.add}</button>
          </div>
        </div>

        <div>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)", display: "block", marginBottom: 6 }}>{copy.tags}</span>
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
            {!tags.length && <span style={{ fontSize: 12, color: "var(--muted)" }}>{copy.noneYet}</span>}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addQuickTag(); } }}
              placeholder={copy.addTagPlaceholder}
              style={{ flex: 1, fontSize: 12 }}
            />
            <button type="button" className={styles.rowBtn} onClick={() => void addQuickTag()}>{copy.add}</button>
          </div>
        </div>
      </div>

      {/* ── SEO (collapsed into small fields) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          {copy.seoTitle}
          <input defaultValue={editing?.seoTitle ?? ""} name="seoTitle" placeholder={copy.seoTitlePlaceholder} />
        </label>
        <label>
          {copy.seoDescription}
          <input defaultValue={editing?.seoDescription ?? ""} name="seoDescription" placeholder={copy.seoDescriptionPlaceholder} />
        </label>
      </div>

      {/* ── Body ── */}
      <RichTextEditor initialValue={editing?.content?.body ?? ""} />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button icon={Save} type="submit">{editing ? copy.saveChanges : copy.publishArticle}</Button>
        {editing && (
          <a href={href("/admin/blog/new")} className={styles.rowBtn} style={{ padding: "6px 14px", fontSize: 13 }}>
            {copy.newPost}
          </a>
        )}
      </div>
      {message && <p style={{ fontSize: 13, margin: "4px 0 0", color: "var(--muted)" }}>{message}</p>}
    </form>
  );
}

// ── BlogCategoryTagManager ───────────────────────────────────────────────────

export function BlogCategoryTagManager() {
  const copy = getDictionary(useLocale()).admin.blogAdmin;
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
    res.ok ? notify.success(copy.categoryCreated) : notify.error(copy.failed);
    if (res.ok) { setNewCat(""); await refresh(); }
  }

  async function updateCategory(id: string, name: string) {
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name })
    });
    res.ok ? notify.success(copy.categoryUpdated) : notify.error(copy.failed);
    if (res.ok) { setEditingCat(null); await refresh(); }
  }

  async function deleteCategory(id: string) {
    if (!window.confirm(copy.confirmDeleteCategory)) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-categories/${id}`, { method: "DELETE", headers: authHeaders() });
    res.ok ? notify.success(copy.deleted) : notify.error(copy.failed);
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
    res.ok ? notify.success(copy.tagCreated) : notify.error(copy.failed);
    if (res.ok) { setNewTag(""); await refresh(); }
  }

  async function updateTag(id: string, name: string) {
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name })
    });
    res.ok ? notify.success(copy.tagUpdated) : notify.error(copy.failed);
    if (res.ok) { setEditingTag(null); await refresh(); }
  }

  async function deleteTag(id: string) {
    if (!window.confirm(copy.confirmDeleteTag)) return;
    const res = await fetch(`${API_BASE_URL}/cms/admin/dev/blog-tags/${id}`, { method: "DELETE", headers: authHeaders() });
    res.ok ? notify.success(copy.deleted) : notify.error(copy.failed);
    if (res.ok) await refresh();
  }

  const localeName = locale === "de" ? copy.langGerman : copy.langEnglish;

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
            {loc === "de" ? copy.chipGerman : copy.chipEnglish}
          </button>
        ))}
        <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center", marginLeft: 8 }}>
          {copy.managing.replace("{lang}", localeName)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
        {/* Categories */}
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>{copy.categoriesOf.replace("{lang}", localeName)}</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createCategory(); } }}
              placeholder={copy.newCategoryPlaceholder.replace("{lang}", localeName)}
              style={{ flex: 1 }}
            />
            <Button type="button" icon={Plus} size="sm" onClick={() => void createCategory()}>{copy.add}</Button>
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
            {!categories.length && <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{copy.noCategories.replace("{lang}", localeName)}</p>}
          </div>
        </div>

        {/* Tags */}
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>{copy.tagsOf.replace("{lang}", localeName)}</h3>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createTag(); } }}
              placeholder={copy.newTagPlaceholder.replace("{lang}", localeName)}
              style={{ flex: 1 }}
            />
            <Button type="button" icon={Plus} size="sm" onClick={() => void createTag()}>{copy.add}</Button>
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
            {!tags.length && <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>{copy.noTags.replace("{lang}", localeName)}</p>}
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
  const copy = getDictionary(useLocale()).admin.blogAdmin;
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
      ? notify.success(next ? copy.aiEnabled : copy.aiDisabled)
      : notify.error(copy.failed);
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
    setMessage(await notifyResponse(res, copy.aiSettingsSaved, copy.saveFailedShort));
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
      const msg = `${copy.generatedPrefix}"${data.title ?? data.id}"`;
      notify.success(msg);
      setGenerateResult(msg);
    } else {
      const data = await res.json().catch(() => ({})) as { message?: string };
      const msg = data.message ?? copy.generationFailed;
      notify.error(msg);
      setGenerateResult(`${copy.errorPrefix}${msg}`);
    }
    setGenerating(false);
  }

  return (
    <div>
      {/* On/Off Toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <strong>{copy.aiContentGeneration}</strong>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 0" }}>
            {isOn ? copy.aiRunning : copy.aiPaused}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={generating} onClick={() => void generateNow()}>
          {generating ? copy.generating : copy.generateNow}
        </Button>
        <Button
          type="button"
          variant={isOn ? "primary" : "secondary"}
          icon={isOn ? Power : PowerOff}
          disabled={toggling}
          onClick={() => void toggleEnabled()}
        >
          {isOn ? copy.on : copy.off}
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
            {copy.articleLanguage}
            <select name="aiBlogLanguage" value={s.aiBlogLanguage} onChange={(e) => setS((p) => ({ ...p, aiBlogLanguage: e.target.value }))}>
              <option value="de">{copy.langDeOption}</option>
              <option value="en">{copy.langEnOption}</option>
              <option value="random">{copy.langRandomOption}</option>
            </select>
          </label>
          <label>
            {copy.targetWordCount}
            <input name="aiBlogWordCount" type="number" min={200} max={5000} step={100} value={s.aiBlogWordCount} onChange={(e) => setS((p) => ({ ...p, aiBlogWordCount: Number(e.target.value) }))} />
          </label>
        </div>

        <label>
          {copy.topicsPool}
          <small style={{ color: "var(--muted)", display: "block", marginBottom: 4 }}>
            {copy.topicsPoolHint}
          </small>
          <textarea
            name="aiBlogTopicsPool"
            rows={8}
            value={s.aiBlogTopicsPool}
            onChange={(e) => setS((p) => ({ ...p, aiBlogTopicsPool: e.target.value }))}
            placeholder={copy.topicsPoolPlaceholder}
            style={{ width: "100%", fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
          />
        </label>

        <h4 style={{ margin: "4px 0 0" }}>{copy.promptCustomization}</h4>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 8px" }}>
          {copy.promptCustomizationHint}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label>
            {copy.titleGuidance}
            <input name="aiBlogTitlePrompt" value={s.aiBlogTitlePrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogTitlePrompt: e.target.value }))} placeholder={copy.titleGuidancePlaceholder} />
          </label>
          <label>
            {copy.excerptGuidance}
            <input name="aiBlogExcerptPrompt" value={s.aiBlogExcerptPrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogExcerptPrompt: e.target.value }))} placeholder={copy.excerptGuidancePlaceholder} />
          </label>
          <label>
            {copy.tagsGuidance}
            <input name="aiBlogTagsPrompt" value={s.aiBlogTagsPrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogTagsPrompt: e.target.value }))} placeholder={copy.tagsGuidancePlaceholder} />
          </label>
          <label>
            {copy.keywordsGuidance}
            <input name="aiBlogKeywordsPrompt" value={s.aiBlogKeywordsPrompt} onChange={(e) => setS((p) => ({ ...p, aiBlogKeywordsPrompt: e.target.value }))} placeholder={copy.keywordsGuidancePlaceholder} />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            {copy.contentGuidance}
            <textarea
              name="aiBlogContentPrompt"
              rows={3}
              value={s.aiBlogContentPrompt}
              onChange={(e) => setS((p) => ({ ...p, aiBlogContentPrompt: e.target.value }))}
              placeholder={copy.contentGuidancePlaceholder}
              style={{ width: "100%", resize: "vertical" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <Button icon={Save} type="submit">{copy.saveSettings}</Button>
        </div>
        {message && <p style={{ fontSize: 13, margin: 0 }}>{message}</p>}
      </form>
    </div>
  );
}

// ── AiJobSettingsForm ────────────────────────────────────────────────────────

export function AiJobSettingsForm() {
  const copy = getDictionary(useLocale()).admin.blogAdmin;
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
  const validationMsg = (isValid ? copy.validOk : copy.validExceeds)
    .replace("{a}", String(articlesPerDay))
    .replace("{i}", String(intervalHours))
    .replace("{t}", String(totalHours));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    const res = await fetch(`${API_BASE_URL}/admin/dev/billing/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ aiBlogArticlesPerDay: articlesPerDay, aiBlogIntervalHours: intervalHours })
    });
    setMessage(await notifyResponse(res, copy.jobSettingsSaved, copy.saveFailedShort));
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={styles.form}>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
        {copy.aiJobIntro}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
        <label>
          {copy.articlesPerDay}
          <input
            type="number"
            min={1}
            max={24}
            value={articlesPerDay}
            onChange={(e) => setArticlesPerDay(Math.max(1, Math.min(24, Number(e.target.value))))}
          />
        </label>
        <label>
          {copy.intervalHours}
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
        <Button icon={Save} type="submit" disabled={!isValid}>{copy.saveJobSettings}</Button>
      </div>
      {message && <p style={{ fontSize: 13, margin: 0 }}>{message}</p>}
    </form>
  );
}
