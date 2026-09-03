"use client";

import dynamic from "next/dynamic";

export const MagnetizedSettleLabClient = dynamic(
  () => import("./MagnetizedSettleLab").then((module) => module.MagnetizedSettleLab),
  { ssr: false },
);
