"use client";

import dynamic from "next/dynamic";

export const PS04M4PreviewClient = dynamic(
  () => import("../PS04M4Lab").then((module) => module.PS04M4Lab),
  { ssr: false },
);
