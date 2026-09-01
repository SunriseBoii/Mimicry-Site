"use client";

import dynamic from "next/dynamic";

export const FramingSandboxLabClient = dynamic(
  () => import("./FramingSandboxLab").then((module) => module.FramingSandboxLab),
  { ssr: false },
);
