import type { Metadata } from "next";
import { M4Lab } from "./M4Lab";

export const metadata: Metadata = {
  title: "PS-03.M4 Transition Lab · Mimicry group",
  robots: { index: false, follow: false },
};

export default function PhotonicSkinM4Page() {
  return <M4Lab />;
}
