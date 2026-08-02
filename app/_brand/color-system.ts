export const competenceOrder = [
  "content",
  "design",
  "event",
  "games",
  "video",
  "digital",
  "merch",
] as const;

export type CompetenceId = (typeof competenceOrder)[number];
export type ColorIntensity = "calm" | "standard" | "expressive";

export const competenceMeta: Record<
  CompetenceId,
  { code: string; label: string; href: string; motif: string }
> = {
  content: {
    code: "01",
    label: "Контент",
    href: "/capabilities/content",
    motif: "параллельные редакционные строки",
  },
  design: {
    code: "02",
    label: "Дизайн",
    href: "/capabilities/design",
    motif: "crop-corner и рамка",
  },
  event: {
    code: "03",
    label: "Event",
    href: "/capabilities/event",
    motif: "сходящиеся линии и общий узел",
  },
  games: {
    code: "04",
    label: "Игры",
    href: "/capabilities/games",
    motif: "ветвящийся маршрут",
  },
  video: {
    code: "05",
    label: "Видео",
    href: "/capabilities/video",
    motif: "последовательность кадров",
  },
  digital: {
    code: "06",
    label: "Digital",
    href: "/capabilities/digital",
    motif: "связанная матрица узлов",
  },
  merch: {
    code: "07",
    label: "Мерч",
    href: "/capabilities/merch",
    motif: "контур и сгиб развёртки",
  },
};

export function isCompetenceId(value: string): value is CompetenceId {
  return competenceOrder.includes(value as CompetenceId);
}
