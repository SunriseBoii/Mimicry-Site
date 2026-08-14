import type { Metadata } from "next";
import { M31RLab } from "./M31RLab";

export const metadata: Metadata = {
  title: "PS-03.M3.1R Production View & Event Review — Mimicry Group",
  description: "Internal patch-review lab for Photonic Skin PS-03.M3.1R.",
  robots: { index: false, follow: false },
};

export default function PhotonicSkinM31RLabPage() {
  return <M31RLab />;
}
