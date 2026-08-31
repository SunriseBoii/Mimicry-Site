import type { Metadata } from "next";
import { PS04M5PreviewClient } from "./PS04M5PreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M5.1 Composition Preview · Mimicry visual lab",
  description: "Clean site-composition preview for Photonic Skin. Prototype only.",
};

export default function PhotonicSkinPS04M5PreviewPage() {
  return <PS04M5PreviewClient mode="preview" />;
}
