import type { Metadata } from "next";
import { MagnetizedSettleR1LabClient } from "./MagnetizedSettleR1LabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.2-R1 live semantics / placement / magnetism · Mimicry visual lab",
  description: "Isolated M6.2-R1 correction lab. Production homepage is unchanged.",
};

export default function PhotonicSkinPS04M62R1Page() {
  return <MagnetizedSettleR1LabClient mode="preview" stage="r1" />;
}
