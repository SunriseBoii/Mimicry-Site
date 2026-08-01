import type { Metadata } from "next";
import { Unbounded } from "next/font/google";
import { designSystemFontVariables } from "../_design-system/fonts";

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
    <div className={`${designSystemFontVariables} ${unbounded.variable}`}>
      {children}
    </div>
  );
}
