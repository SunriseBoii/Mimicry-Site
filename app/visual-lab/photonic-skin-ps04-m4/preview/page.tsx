import type { Metadata } from "next";
import { PS04M4PreviewClient } from "./PS04M4PreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M4 Composition Preview · Mimicry visual lab",
  description: "Clean site-composition preview for Photonic Skin. Prototype only.",
};

export default function PhotonicSkinPS04M4PreviewPage() {
  return <PS04M4PreviewClient mode="preview" />;
}
