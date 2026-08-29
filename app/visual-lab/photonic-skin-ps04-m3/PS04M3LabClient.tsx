"use client";

import dynamic from "next/dynamic";

export const PS04M3LabClient = dynamic(
  () => import("./PS04M3Lab").then((module) => module.PS04M3Lab),
  { ssr: false },
);
