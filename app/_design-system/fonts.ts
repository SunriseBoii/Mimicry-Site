import { IBM_Plex_Mono, Onest } from "next/font/google";

export const onest = Onest({
  subsets: ["cyrillic", "latin"],
  variable: "--font-onest",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const designSystemFontVariables = `${onest.variable} ${plexMono.variable}`;
