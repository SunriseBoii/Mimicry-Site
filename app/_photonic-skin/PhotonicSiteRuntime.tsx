"use client";

import { MagnetizedSettleLab } from "../visual-lab/photonic-skin-ps04-m6/magnetized-settle/MagnetizedSettleLab";

/** Local PS-04 release candidate. Public deployment remains a separate action. */
export function PhotonicSiteRuntime({ mode }: { mode: "production" }) {
  void mode;
  return <MagnetizedSettleLab mode="preview" stage="final-r2" refinedScales />;
}
