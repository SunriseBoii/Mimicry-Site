import type { Metadata } from "next";
import { VideoSandboxPreviewClient } from "./VideoSandboxPreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M5.3.R1 Video sandbox preview · Mimicry visual lab",
  description: "Clean Video-variant preview. Prototype only.",
};

export default function PhotonicSkinPS04M53VideoSandboxPreviewPage() {
  return <VideoSandboxPreviewClient mode="preview" />;
}
