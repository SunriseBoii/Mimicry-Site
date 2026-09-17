import type { Metadata } from "next";
import { FinalR2Client } from "./FinalR2Client";

export const metadata: Metadata = {
  title: "PS-04 final R2 В· Mimicry",
  description: "Isolated PS-04 release candidate for visual review.",
};

export default function PS04FinalR2Page() {
  return <FinalR2Client mode="preview" stage="final-r2" />;
}
