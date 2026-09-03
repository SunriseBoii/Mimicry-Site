"use client";

import dynamic from "next/dynamic";

export const MagnetizedSettleR2LabClient = dynamic(
  () => import("../magnetized-settle/MagnetizedSettleLab").then((module) => module.MagnetizedSettleLab),
  { ssr: false },
);
