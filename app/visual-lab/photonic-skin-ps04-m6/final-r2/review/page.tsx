import type { Metadata } from "next";
import { FinalR2Client } from "../FinalR2Client";

export const metadata: Metadata = {
  title: "PS-04 final R2 review В· Mimicry",
  description: "Diagnostics for the PS-04 release candidate.",
};

export default function PS04FinalR2ReviewPage() {
  return <FinalR2Client mode="lab" stage="final-r2" />;
}
