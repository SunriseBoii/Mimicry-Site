import type { Metadata } from "next";
import { PS04M3PreviewClient } from "./PS04M3PreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M3 Motion Preview · Mimicry visual lab",
  description: "Isolated hero envelope for Photonic Skin idle motion and transitions.",
};

export default function PhotonicSkinPS04M3PreviewPage() {
  return <PS04M3PreviewClient />;
}
