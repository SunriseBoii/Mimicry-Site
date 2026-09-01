import type { Metadata } from "next";
import { FramingSandboxLabClient } from "./FramingSandboxLabClient";

export const metadata: Metadata = {
  title: "PS-04.M5.4 Framing sandbox · Mimicry visual lab",
  description: "Isolated presentation framing sandbox. Does not change production Mimic geometry or camera pose.",
};

export default function PhotonicSkinPS04M54FramingSandboxPage() {
  return <FramingSandboxLabClient mode="lab" />;
}
