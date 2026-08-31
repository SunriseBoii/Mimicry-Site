import type { Metadata } from "next";
import { EventSandboxPreviewClient } from "./EventSandboxPreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M5.2 Event sandbox preview · Mimicry visual lab",
  description: "Clean Event-variant preview. Prototype only.",
};

export default function PhotonicSkinPS04M52EventSandboxPreviewPage() {
  return <EventSandboxPreviewClient mode="preview" />;
}
