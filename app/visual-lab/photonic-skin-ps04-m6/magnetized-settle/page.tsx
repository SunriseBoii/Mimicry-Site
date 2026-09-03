import type { Metadata } from "next";
import { MagnetizedSettleLabClient } from "./MagnetizedSettleLabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.2 Magnetized settle · Mimicry visual lab",
  description: "Isolated magnetized-settle transformation scheduler. Production homepage is unchanged.",
};

export default function PhotonicSkinPS04M62MagnetizedSettlePage() {
  return <MagnetizedSettleLabClient mode="preview" />;
}
