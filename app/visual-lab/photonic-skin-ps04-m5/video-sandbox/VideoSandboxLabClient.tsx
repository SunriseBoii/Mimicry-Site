"use client";

import dynamic from "next/dynamic";

export const VideoSandboxLabClient = dynamic(
  () => import("./VideoSandboxLab").then((module) => module.VideoSandboxLab),
  { ssr: false },
);
