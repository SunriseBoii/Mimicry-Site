import type { Metadata } from "next";
import { ColorLab } from "../../_brand/color-lab/ColorLab";
import { SiteShell } from "../../_site/SiteShell";

export const metadata: Metadata = {
  title: "Color lab v0.2 — Mimicry group",
  robots: { index: false, follow: false },
};

export default function ColorLabPage() {
  return (
    <SiteShell>
      <ColorLab />
    </SiteShell>
  );
}
