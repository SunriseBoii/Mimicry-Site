import type { Metadata } from "next";
import { FinalR1Client } from "./FinalR1Client";

export const metadata: Metadata = {
  title: "PS-04 final R1 · Mimicry",
  description: "Isolated PS-04 release candidate for visual review.",
};

export default function PS04FinalR1Page() {
  return <FinalR1Client mode="preview" stage="final" />;
}
