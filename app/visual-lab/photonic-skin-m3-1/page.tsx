import type { Metadata } from "next";
import { M31Lab } from "./M31Lab";

export const metadata: Metadata = {
  title: "PS-03.M3.1 Complex Composition Lab — Mimicry Group",
  description: "Internal static-endpoint validation lab for Photonic Skin PS-03.M3.1.",
  robots: { index: false, follow: false },
};

export default function PhotonicSkinM31LabPage() {
  return <M31Lab />;
}
