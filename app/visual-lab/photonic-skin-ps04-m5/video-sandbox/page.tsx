import type { Metadata } from "next";
import { VideoSandboxLabClient } from "./VideoSandboxLabClient";

export const metadata: Metadata = {
  title: "PS-04.M5.3.R1 Video sandbox · Mimicry visual lab",
  description: "Isolated Video associative-object sandbox. Does not replace canonical Video.",
};

export default function PhotonicSkinPS04M53VideoSandboxPage() {
  return <VideoSandboxLabClient mode="lab" />;
}
