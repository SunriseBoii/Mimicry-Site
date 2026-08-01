import type { Metadata } from "next";
import { IBM_Plex_Mono, Onest, Unbounded } from "next/font/google";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  variable: "--font-onest",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600"],
  variable: "--font-unbounded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Visual Lab — Mimicry group",
  description: "Служебная лаборатория визуальной системы Mimicry group.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function VisualLabLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${onest.variable} ${plexMono.variable} ${unbounded.variable}`}>
      {children}
    </div>
  );
}
