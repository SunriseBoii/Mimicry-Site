export type VariantId = "a" | "b" | "c";
export type ViewportId = "desktop" | "laptop" | "mobile";
export type PlaceholderMode = "neutral" | "documentary";

export type Token = {
  label: string;
  value: string;
  color?: string;
};

export type Variant = {
  id: VariantId;
  shortLabel: string;
  name: string;
  role: string;
  tokens: readonly Token[];
};

export const variants: readonly Variant[] = [
  {
    id: "a",
    shortLabel: "A",
    name: "Редакционный вектор",
    role: "Базовый кандидат · контролируемый гибрид",
    tokens: [
      {
        label: "Background",
        value: "var(--ds-color-background)",
        color: "var(--ds-color-background)",
      },
      {
        label: "Text",
        value: "var(--ds-color-text)",
        color: "var(--ds-color-text)",
      },
      {
        label: "Direction",
        value: "var(--ds-color-action)",
        color: "var(--ds-color-action)",
      },
      {
        label: "Signal",
        value: "var(--ds-color-signal)",
        color: "var(--ds-color-signal)",
      },
      { label: "Type", value: "Onest + IBM Plex Mono" },
      { label: "Grid", value: "var(--ds-container-max) · 12 / 8 / 4" },
    ],
  },
  {
    id: "b",
    shortLabel: "B",
    name: "Сигнальная сборка",
    role: "Стресс-тест системности",
    tokens: [
      { label: "Canvas", value: "#F1F5F1", color: "#F1F5F1" },
      { label: "Ink", value: "#10231D", color: "#10231D" },
      { label: "Action", value: "#FF5A3C", color: "#FF5A3C" },
      { label: "Information", value: "#175CD3", color: "#175CD3" },
      { label: "Type", value: "Onest + IBM Plex Mono" },
      { label: "Grid", value: "12 / 8 / 4 · max 1320" },
    ],
  },
  {
    id: "c",
    shortLabel: "C",
    name: "Кинетическая рамка",
    role: "Стресс-тест человечности",
    tokens: [
      { label: "Canvas", value: "#F7EFE4", color: "#F7EFE4" },
      { label: "Stage", value: "#15100D", color: "#15100D" },
      { label: "Impulse", value: "#FF4B1F", color: "#FF4B1F" },
      { label: "Topic", value: "#5A3BFF", color: "#5A3BFF" },
      { label: "Type", value: "Onest + Unbounded + Mono" },
      { label: "Grid", value: "12 / 8 / 4 · max 1280" },
    ],
  },
] as const;

export const viewports = [
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "laptop", label: "Laptop", width: 1024 },
  { id: "mobile", label: "Mobile", width: 390 },
] as const satisfies ReadonlyArray<{
  id: ViewportId;
  label: string;
  width: number;
}>;
