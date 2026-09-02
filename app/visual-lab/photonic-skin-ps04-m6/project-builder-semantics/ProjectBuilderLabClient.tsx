"use client";

import dynamic from "next/dynamic";

export const ProjectBuilderLabClient = dynamic(
  () => import("./ProjectBuilderLab").then((module) => module.ProjectBuilderLab),
  { ssr: false },
);
