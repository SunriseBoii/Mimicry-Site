import type { Metadata } from "next";
import { PS04M4LabClient } from "./PS04M4LabClient";

export const metadata: Metadata = {
  title: "PS-04.M4 Site Composition · Mimicry visual lab",
  description: "Isolated full-page Photonic Skin composition lab. Not the production homepage.",
};

export default function PhotonicSkinPS04M4Page() {
  return <PS04M4LabClient mode="lab" />;
}
