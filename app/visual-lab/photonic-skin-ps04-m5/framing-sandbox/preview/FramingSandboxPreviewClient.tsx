"use client";

import dynamic from "next/dynamic";

export const FramingSandboxPreviewClient = dynamic(
  () => import("../FramingSandboxLab").then((module) => module.FramingSandboxLab),
  { ssr: false },
);
