"use client";

import dynamic from "next/dynamic";

export const EventSandboxLabClient = dynamic(
  () => import("./EventSandboxLab").then((module) => module.EventSandboxLab),
  { ssr: false },
);
