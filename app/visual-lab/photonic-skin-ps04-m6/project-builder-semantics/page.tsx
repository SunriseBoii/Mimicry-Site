import type { Metadata } from "next";
import { ProjectBuilderLabClient } from "./ProjectBuilderLabClient";

export const metadata: Metadata = {
  title: "PS-04.M6.1 Project builder semantics · Mimicry visual lab",
  description: "Isolated project-builder Mimic semantics. Production homepage is unchanged.",
};

export default function PhotonicSkinPS04M61ProjectBuilderPage() {
  return <ProjectBuilderLabClient mode="preview" />;
}
