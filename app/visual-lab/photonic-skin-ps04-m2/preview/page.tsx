import type { Metadata } from "next";
import { PS04M2PreviewClient } from "./PS04M2PreviewClient";

export const metadata: Metadata = {
  title: "PS-04.M2 Color Field Preview · Mimicry visual lab",
  description: "Desktop and mobile-safe hero context for the Photonic Skin competence color field.",
};

export default function PhotonicSkinPS04M2PreviewPage() {
  return <PS04M2PreviewClient />;
}
