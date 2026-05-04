import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crimson Hosting Platform",
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
        {children}
      </body>
    </html>
  );
}
