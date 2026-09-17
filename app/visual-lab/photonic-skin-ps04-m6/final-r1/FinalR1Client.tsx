"use client";

import dynamic from "next/dynamic";

export const FinalR1Client = dynamic(
  () => import("../magnetized-settle/MagnetizedSettleLab").then((module) => module.MagnetizedSettleLab),
  { ssr: false },
);
