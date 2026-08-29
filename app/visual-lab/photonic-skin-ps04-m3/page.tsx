import type { Metadata } from "next";
import { PS04M3LabClient } from "./PS04M3LabClient";

export const metadata: Metadata = {
  title: "PS-04.M3 Surface Motion · Mimicry visual lab",
  description: "Idle breathing, rock/turn, and M4-linked color choreography for Photonic Skin.",
};

export default function PhotonicSkinPS04M3Page() {
  return <PS04M3LabClient />;
}
