"use client";

import { useState } from "react";
import { API_BASE_URL, authHeaders } from "../../lib/api";
import { ImageUploader } from "../ui/image-uploader";
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

const pages: { field: keyof BlueThemeImages; label: string; hint: string }[] = [
  { field: "homeHeroImageUrl", label: "Home", hint: "Displayed on the home page hero." },
  { field: "webhostingHeroImageUrl", label: "Webhosting", hint: "Displayed on the webhosting page hero." },
  { field: "domainsHeroImageUrl", label: "Domains", hint: "Displayed on the domains page hero." },
  { field: "itSolutionsHeroImageUrl", label: "IT Solutions", hint: "Displayed on the IT solutions page hero." },
  { field: "contactHeroImageUrl", label: "Contact", hint: "Displayed on the contact page hero." },
  { field: "aboutHeroImageUrl", label: "About Us", hint: "Displayed on the about page hero." },
  { field: "virtualServersHeroImageUrl", label: "Virtual Servers", hint: "Displayed on the virtual servers page hero." },
  { field: "webdesignHeroImageUrl", label: "Webdesign", hint: "Displayed on the webdesign page hero." },
  { field: "blogHeroImageUrl", label: "Blog", hint: "Displayed on the blog listing page hero." },
  { field: "knowledgebaseHeroImageUrl", label: "Knowledgebase", hint: "Displayed on the knowledgebase page hero." },
];

export function ThemeBlueForm({ initialImages }: { initialImages: BlueThemeImages }) {
  const [images, setImages] = useState<BlueThemeImages>(initialImages);

  function update(field: keyof BlueThemeImages, url: string) {
    setImages((prev) => ({ ...prev, [field]: url }));
  }

  return (
    <div>
      {pages.map(({ field, label, hint }) => (
        <div className={styles.panel} key={field} style={{ marginBottom: 20 }}>
          <div className={styles.panelHeader}>
            <h2>{label} — Hero Image</h2>
          </div>
          <div className={styles.form}>
            <p style={{ color: "var(--muted)", fontSize: "0.92rem", margin: "0 0 16px" }}>{hint} Accepted: PNG, SVG, JPG, WebP, GIF. Max 5 MB.</p>
            <ImageUploader
              accept="image/png,image/svg+xml,image/jpeg,image/webp,image/gif"
              action={`${API_BASE_URL}/admin/dev/assets/theme-image/blue/${field}`}
              headers={authHeaders("admin")}
              label={`${label} Hero Image`}
              previewUrl={images[field] || undefined}
              onUploaded={(payload) => update(field, String(payload.imageUrl ?? ""))}
            />
            {images[field] && (
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 8 }}>
                Current URL: <code>{images[field]}</code>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
