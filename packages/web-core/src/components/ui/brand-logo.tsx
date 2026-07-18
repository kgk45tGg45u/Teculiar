"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dashboard brand slot: renders the uploaded site logo, falling back to the text
 * placeholder when no logo is configured or the image fails to load. The mount check
 * catches images that already failed during SSR HTML parsing, before React attached
 * the onError handler.
 */
export function BrandLogo({ src, alt, fallback }: { src?: string; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) {
      setFailed(true);
    }
  }, [src]);

  if (!src || failed) {
    return <span className="brand-placeholder">{fallback}</span>;
  }
  return <img alt={alt} className="brand-logo" onError={() => setFailed(true)} ref={ref} src={src} />;
}
