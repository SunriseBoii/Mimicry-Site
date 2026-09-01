import type { Metadata } from "next";
import { FramingSandboxPreviewClient } from "./FramingSandboxPreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M5.4 Framing sandbox preview · Mimicry visual lab",
  description: "Clean framing preview. Prototype only. Production homepage is unchanged.",
};

export default function PhotonicSkinPS04M54FramingSandboxPreviewPage() {
  return <FramingSandboxPreviewClient mode="preview" />;
}
