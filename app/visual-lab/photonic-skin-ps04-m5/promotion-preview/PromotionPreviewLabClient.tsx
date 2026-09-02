"use client";

import dynamic from "next/dynamic";

export const PromotionPreviewLabClient = dynamic(
  () => import("./PromotionPreviewLab").then((module) => module.PromotionPreviewLab),
  { ssr: false },
);
