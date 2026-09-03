import type { Metadata } from "next";
import { MagnetizedSettleR2LabClient } from "../MagnetizedSettleR2LabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.2-R2 review · Mimicry visual lab",
  description: "QA HUD for isolated M6.2-R2 real UI builder transformation. Not production.",
};

export default function PhotonicSkinPS04M62R2ReviewPage() {
  return <MagnetizedSettleR2LabClient mode="lab" stage="r2" />;
}
