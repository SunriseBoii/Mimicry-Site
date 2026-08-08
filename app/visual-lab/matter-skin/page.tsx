import type { Metadata } from "next";
import { MatterSkinLab } from "./MatterSkinLab";
import { parseInitialMatterLabSettings } from "./matter-lab-config";

export const metadata: Metadata = {
  title: "PS-03.M — Matter & Skin Lab · Mimicry group",
  description:
    "Изолированный технический spike архитектуры вещества и кожи Photonic Skin.",
  robots: { index: false, follow: false },
};

export default async function MatterSkinLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialSettings = parseInitialMatterLabSettings(await searchParams);
  return <MatterSkinLab initialSettings={initialSettings} />;
}
