"use client";

import dynamic from "next/dynamic";

export const PS04M5LabClient = dynamic(
  () => import("./PS04M5Lab").then((module) => module.PS04M5Lab),
  { ssr: false },
);
