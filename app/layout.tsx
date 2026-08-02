import type { Metadata } from "next";
import tokens from "./_design-system/theme/tokens.module.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mimicry group — прототип цветовой системы v0.2",
  description:
    "Кликабельный low-fidelity-прототип сайта агентства корпоративных коммуникаций Mimicry group.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

const themeScript = `
(() => {
  const key = "mimicry-theme";
  const saved = localStorage.getItem(key);
  const preference = saved === "light" || saved === "dark" ? saved : "system";
  const theme = preference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={tokens.tokens}>{children}</body>
    </html>
  );
}
