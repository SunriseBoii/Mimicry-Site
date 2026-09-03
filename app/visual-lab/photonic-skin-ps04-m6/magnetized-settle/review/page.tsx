import type { Metadata } from "next";
import { MagnetizedSettleLabClient } from "../MagnetizedSettleLabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.2 Magnetized settle review · Mimicry visual lab",
  description: "QA HUD for isolated M6.2 magnetized-settle motion. Not production.",
};

export default function PhotonicSkinPS04M62MagnetizedSettleReviewPage() {
  return <MagnetizedSettleLabClient mode="lab" />;
}
