import type { Metadata } from "next";
import { FinalR1Client } from "../FinalR1Client";

export const metadata: Metadata = {
  title: "PS-04 final R1 review · Mimicry",
  description: "Diagnostics for the PS-04 release candidate.",
};

export default function PS04FinalR1ReviewPage() {
  return <FinalR1Client mode="lab" stage="final" />;
}
