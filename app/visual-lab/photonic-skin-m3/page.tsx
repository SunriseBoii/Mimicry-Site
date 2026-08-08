import type { Metadata } from "next";
import { M3Lab } from "./M3Lab";

export const metadata: Metadata = {
  title: "PS-03.M3 Universal State Lab — Mimicry Group",
  robots: { index: false, follow: false },
};

export default function PhotonicSkinM3LabPage() {
  return <M3Lab />;
}
