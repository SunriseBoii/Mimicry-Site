"use client";

import dynamic from "next/dynamic";

export const EventSandboxPreviewClient = dynamic(
  () => import("../EventSandboxLab").then((module) => module.EventSandboxLab),
  { ssr: false },
);
