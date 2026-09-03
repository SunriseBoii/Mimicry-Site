"use client";

import dynamic from "next/dynamic";

export const MagnetizedSettleR1LabClient = dynamic(
  () => import("../magnetized-settle/MagnetizedSettleLab").then((module) => module.MagnetizedSettleLab),
  { ssr: false },
);
