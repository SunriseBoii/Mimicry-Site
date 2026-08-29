"use client";

import dynamic from "next/dynamic";

export const PS04M3PreviewClient = dynamic(
  () => import("./PS04M3Preview").then((module) => module.PS04M3Preview),
  { ssr: false },
);
