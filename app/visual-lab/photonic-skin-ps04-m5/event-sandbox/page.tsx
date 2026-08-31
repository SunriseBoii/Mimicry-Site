import type { Metadata } from "next";
import { EventSandboxLabClient } from "./EventSandboxLabClient";

export const metadata: Metadata = {
  title: "PS-04.M5.2 Event sandbox · Mimicry visual lab",
  description: "Isolated Event associative-object sandbox. Does not replace canonical Event.",
};

export default function PhotonicSkinPS04M52EventSandboxPage() {
  return <EventSandboxLabClient mode="lab" />;
}
