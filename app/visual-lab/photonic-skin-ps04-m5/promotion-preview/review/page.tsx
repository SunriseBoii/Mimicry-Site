import type { Metadata } from "next";
import { PromotionPreviewLabClient } from "../PromotionPreviewLabClient";

export const metadata: Metadata = {
  title: "PS-04.M5.5 Promotion review · Mimicry visual lab",
  description: "QA HUD for the isolated M5.5 promotion candidate. Not production.",
};

export default function PhotonicSkinPS04M55PromotionReviewPage() {
  return <PromotionPreviewLabClient mode="lab" />;
}
