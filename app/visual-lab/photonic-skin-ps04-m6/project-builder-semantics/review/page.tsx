import type { Metadata } from "next";
import { ProjectBuilderLabClient } from "../ProjectBuilderLabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.1 Project builder review · Mimicry visual lab",
  description: "QA HUD for isolated M6.1 project-builder Mimic semantics. Not production.",
};

export default function PhotonicSkinPS04M61ProjectBuilderReviewPage() {
  return <ProjectBuilderLabClient mode="lab" />;
}
