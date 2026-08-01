import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Production UI Kit — Mimicry group",
  description: "Служебная проверка production-дизайн-системы Mimicry group.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UiKitLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
