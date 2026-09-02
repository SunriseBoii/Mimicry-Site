import type { Metadata } from "next";
import { PromotionPreviewLabClient } from "./PromotionPreviewLabClient";

export const metadata: Metadata = {
  title: "PS-04.M5.5 Promotion preview · Mimicry visual lab",
  description: "Isolated integrated promotion preview. Production homepage is unchanged.",
};

export default function PhotonicSkinPS04M55PromotionPreviewPage() {
  return <PromotionPreviewLabClient mode="preview" />;
}
