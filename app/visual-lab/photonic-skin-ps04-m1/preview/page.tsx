import type { Metadata } from "next";
import { PS04M1Preview } from "./PS04M1Preview";

export const metadata: Metadata = {
  title: "PS-04.M1 Hero Preview · Mimicry visual lab",
  description: "Desktop hero context preview for the neutral Photonic Skin material foundation.",
};

export default function PhotonicSkinPS04M1PreviewPage() {
  return <PS04M1Preview />;
}
