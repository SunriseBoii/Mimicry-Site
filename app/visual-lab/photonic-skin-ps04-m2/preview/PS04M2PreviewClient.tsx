"use client";

import dynamic from "next/dynamic";

export const PS04M2PreviewClient = dynamic(
  () => import("./PS04M2Preview").then((module) => module.PS04M2Preview),
  { ssr: false },
);
