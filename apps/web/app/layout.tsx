import type { Metadata } from "next";
import "react-toastify/dist/ReactToastify.css";
import { ToastProvider } from "../components/ui/toast-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dezhost",
  description: "German hosting and IT services SaaS platform"
};

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
    <html lang="de" suppressHydrationWarning>
      <body>
        <ThemeBootstrap />
        <ToastProvider />
        {children}
      </body>
    </html>
  );
}
