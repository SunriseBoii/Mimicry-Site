import type { Metadata } from "next";
import { M41Lab } from "./M41Lab";

export const metadata: Metadata = {
  title: "PS-03.M4.1R Presentation Parity Lab · Mimicry group",
  robots: { index: false, follow: false },
};

export default function PhotonicSkinM41RPage() {
  return <M41Lab />;
}
