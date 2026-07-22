import type { Metadata } from "next";
import "react-toastify/dist/ReactToastify.css";
import { ToastProvider } from "@teculiar/web-core/components/ui/toast-provider";
import { apiGet } from "@teculiar/web-core/lib/api";
import { DEFAULT_LOCALE } from "@teculiar/web-core/lib/supported-locales";
import "@teculiar/web-core/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await apiGet<{ faviconUrl?: string; siteName?: string; metaDescription?: string }>("/storefront/settings");
  const faviconUrl = settings?.faviconUrl;
  return {
    title: settings?.siteName || "Teculiar",
    description: settings?.metaDescription || "German Webhosting and IT services",
    icons: faviconUrl ? { icon: faviconUrl, shortcut: faviconUrl } : undefined
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body>
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
