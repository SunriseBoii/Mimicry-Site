"use client";

import dynamic from "next/dynamic";

export const PS04M2LabClient = dynamic(
  () => import("./PS04M2Lab").then((module) => module.PS04M2Lab),
  { ssr: false },
);
