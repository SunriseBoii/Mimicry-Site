import type { Metadata } from "next";
import { PS04M2LabClient } from "./PS04M2LabClient";

export const metadata: Metadata = {
  title: "PS-04.M2 Photonic Color Field · Mimicry visual lab",
  description: "Actor-space procedural color field for the frozen Photonic Skin material system.",
};

export default function PhotonicSkinPS04M2Page() {
  return <PS04M2LabClient />;
}
