import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mimicry group — low-fidelity прототип",
  description:
    "Кликабельный low-fidelity-прототип сайта агентства корпоративных коммуникаций Mimicry group.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
