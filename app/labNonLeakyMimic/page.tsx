import type { Metadata } from "next";
import { NonLeakyClient } from "./NonLeakyClient";

export const metadata: Metadata = {
  title: "Non-leaky Mimic · Surface Lab",
  description: "Эксперимент с непрерывной чешуйчатой оболочкой мимика.",
  robots: { index: false, follow: false },
};

export default function NonLeakyMimicPage() {
  return <NonLeakyClient />;
}
