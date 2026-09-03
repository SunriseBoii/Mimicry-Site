import type { Metadata } from "next";
import { MagnetizedSettleR1LabClient } from "../MagnetizedSettleR1LabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.2-R1 review · Mimicry visual lab",
  description: "QA HUD for isolated M6.2-R1 live semantics, placement, and magnetism. Not production.",
};

export default function PhotonicSkinPS04M62R1ReviewPage() {
  return <MagnetizedSettleR1LabClient mode="lab" stage="r1" />;
}
