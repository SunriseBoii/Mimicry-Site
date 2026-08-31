import type { Metadata } from "next";
import { PS04M5LabClient } from "./PS04M5LabClient";

export const metadata: Metadata = {
  title: "PS-04.M5.1 Site Composition · Mimicry visual lab",
  description: "Isolated full-page Photonic Skin composition lab. Not the production homepage.",
};

export default function PhotonicSkinPS04M5Page() {
  return <PS04M5LabClient mode="lab" />;
}
