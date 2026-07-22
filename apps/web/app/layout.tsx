import type { Metadata } from "next";
import "react-toastify/dist/ReactToastify.css";
import { CookieBanner } from "@teculiar/web-core/components/layout/cookie-banner";
import { ToastProvider } from "@teculiar/web-core/components/ui/toast-provider";
import { serverApiGet } from "@teculiar/web-core/lib/server-api";
import { DEFAULT_LOCALE } from "@teculiar/web-core/lib/supported-locales";
import "@teculiar/web-core/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await serverApiGet<{ faviconUrl?: string }>("/storefront/settings");
  const faviconUrl = settings?.faviconUrl;
  return {
    title: "Teculiar",
    description: "German Webhosting and IT services",
    icons: faviconUrl ? { icon: faviconUrl, shortcut: faviconUrl } : undefined
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="dash-compact">
        <ToastProvider />
        {children}
        <CookieBanner locale={DEFAULT_LOCALE} />
      </body>
    </html>
  );
}
