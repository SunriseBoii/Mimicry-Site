import type { Metadata } from "next";
import { MagnetizedSettleR2LabClient } from "./MagnetizedSettleR2LabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.2-R2 real UI builder transformation · Mimicry visual lab",
  description: "Isolated M6.2-R2 real DOM competency-click correction. Production homepage is unchanged.",
};

export default function PhotonicSkinPS04M62R2Page() {
  return <MagnetizedSettleR2LabClient mode="preview" stage="r2" />;
}
