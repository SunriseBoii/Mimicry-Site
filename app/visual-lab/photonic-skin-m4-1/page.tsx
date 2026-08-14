import type { Metadata } from "next";
import { M41Lab } from "./M41Lab";

export const metadata: Metadata = {
  title: "PS-03.M4.1 Transition Lab · Mimicry group",
  robots: { index: false, follow: false },
};

export default function PhotonicSkinM4Page() {
  return <M41Lab />;
}
