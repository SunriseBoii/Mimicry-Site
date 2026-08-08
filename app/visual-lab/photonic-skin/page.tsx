import type { Metadata } from "next";
import { PhotonicSkinLab } from "./PhotonicSkinLab";
import { parseInitialLabSettings } from "./lab-config";

export const metadata: Metadata = {
  title: "PS-01 — Photonic Skin Lab · Mimicry group",
  description: "Изолированная инженерная лаборатория визуального актора Mimicry.",
  robots: { index: false, follow: false },
};

export default async function PhotonicSkinLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialSettings = parseInitialLabSettings(await searchParams);
  return <PhotonicSkinLab initialSettings={initialSettings} />;
}

