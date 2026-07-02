"use client";

import { useState } from "react";
import { API_BASE_URL, authHeaders } from "@dezhost/web-core/lib/api";
import { useLocale } from "@dezhost/web-core/components/layout/locale-provider";
import { getDictionary } from "@dezhost/web-core/lib/dictionary";
import { ImageUploader } from "@dezhost/web-core/components/ui/image-uploader";
import styles from "./admin-dashboard.module.css";

type BlueThemeImages = {
  homeHeroImageUrl: string;
  webhostingHeroImageUrl: string;
  domainsHeroImageUrl: string;
  itSolutionsHeroImageUrl: string;
  contactHeroImageUrl: string;
  aboutHeroImageUrl: string;
  virtualServersHeroImageUrl: string;
  webdesignHeroImageUrl: string;
  blogHeroImageUrl: string;
  knowledgebaseHeroImageUrl: string;
};

export function ThemeBlueForm({ initialImages }: { initialImages: BlueThemeImages }) {
  const c = getDictionary(useLocale()).admin.theme;
  const pages: { field: keyof BlueThemeImages; label: string; hint: string }[] = [
    { field: "homeHeroImageUrl", label: c.pageHome, hint: c.hintHome },
    { field: "webhostingHeroImageUrl", label: c.pageWebhosting, hint: c.hintWebhosting },
    { field: "domainsHeroImageUrl", label: c.pageDomains, hint: c.hintDomains },
    { field: "itSolutionsHeroImageUrl", label: c.pageItSolutions, hint: c.hintItSolutions },
    { field: "contactHeroImageUrl", label: c.pageContact, hint: c.hintContact },
    { field: "aboutHeroImageUrl", label: c.pageAbout, hint: c.hintAbout },
    { field: "virtualServersHeroImageUrl", label: c.pageVirtualServers, hint: c.hintVirtualServers },
    { field: "webdesignHeroImageUrl", label: c.pageWebdesign, hint: c.hintWebdesign },
    { field: "blogHeroImageUrl", label: c.pageBlog, hint: c.hintBlog },
    { field: "knowledgebaseHeroImageUrl", label: c.pageKnowledgebase, hint: c.hintKnowledgebase }
  ];
  const [images, setImages] = useState<BlueThemeImages>(initialImages);

  function update(field: keyof BlueThemeImages, url: string) {
    setImages((prev) => ({ ...prev, [field]: url }));
  }

  return (
    <div>
      {pages.map(({ field, label, hint }) => (
        <div className={styles.panel} key={field} style={{ marginBottom: 20 }}>
          <div className={styles.panelHeader}>
            <h2>{label} — {c.heroImage}</h2>
          </div>
          <div className={styles.form}>
            <p style={{ color: "var(--muted)", fontSize: "0.92rem", margin: "0 0 16px" }}>{hint} {c.accepted}</p>
            <ImageUploader
              accept="image/png,image/svg+xml,image/jpeg,image/webp,image/gif"
              action={`${API_BASE_URL}/admin/dev/assets/theme-image/blue/${field}`}
              headers={authHeaders("admin")}
              label={`${label} ${c.heroImage}`}
              previewUrl={images[field] || undefined}
              onUploaded={(payload) => update(field, String(payload.imageUrl ?? ""))}
            />
            {images[field] && (
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 8 }}>
                {c.currentUrl} <code>{images[field]}</code>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
