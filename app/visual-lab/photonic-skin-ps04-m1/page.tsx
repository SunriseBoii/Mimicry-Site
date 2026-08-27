import type { Metadata } from "next";
import { PS04M1Lab } from "./PS04M1Lab";

export const metadata: Metadata = {
  title: "PS-04.M1 Material Foundation · Mimicry visual lab",
  description: "Production-capable neutral material foundation for the frozen Photonic Skin actor.",
};

export default function PhotonicSkinPS04M1Page() {
  return <PS04M1Lab />;
}
