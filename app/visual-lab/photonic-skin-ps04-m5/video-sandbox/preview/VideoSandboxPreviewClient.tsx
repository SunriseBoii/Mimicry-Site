"use client";

import dynamic from "next/dynamic";

export const VideoSandboxPreviewClient = dynamic(
  () => import("../VideoSandboxLab").then((module) => module.VideoSandboxLab),
  { ssr: false },
);
