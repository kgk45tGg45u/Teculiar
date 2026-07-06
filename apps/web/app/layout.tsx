import type { Metadata } from "next";
import "react-toastify/dist/ReactToastify.css";
import { ToastProvider } from "@dezhost/web-core/components/ui/toast-provider";
import { serverApiGet } from "@dezhost/web-core/lib/server-api";
import { DEFAULT_LOCALE } from "@dezhost/web-core/lib/supported-locales";
import "@dezhost/web-core/globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await serverApiGet<{ faviconUrl?: string }>("/storefront/settings");
  const faviconUrl = settings?.faviconUrl;
  return {
    title: "Dezhost",
    description: "German Webhosting and IT services",
    icons: faviconUrl ? { icon: faviconUrl, shortcut: faviconUrl } : undefined
  };
}

function ThemeBootstrap() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (() => {
            const stored = localStorage.getItem("theme");
            const theme = stored || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            document.documentElement.dataset.theme = theme;
          })();
        `
      }}
    />
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={DEFAULT_LOCALE} suppressHydrationWarning>
      <body>
        <ThemeBootstrap />
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
