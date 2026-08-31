/**
 * Canonical homepage topology for PS-04.M5 (frozen copy of M4).
 * Layout coordinates are registry data, not measured from DOM pixels.
 */

export const SCREEN_NODE_IDS = [
  "01",
  "02",
  "03.1",
  "03.2",
  "03.3",
  "04",
  "05.1",
  "05.2",
  "05.3",
  "05.4",
  "05.5",
  "05.6",
  "05.7",
  "06.1",
  "06.2",
  "06.3",
  "07",
  "08",
] as const;

export type ScreenNodeId = (typeof SCREEN_NODE_IDS)[number];

export const TEMPORARY_STATE_IDS = ["03.3A", "03.3B"] as const;
export type TemporaryStateId = (typeof TEMPORARY_STATE_IDS)[number];

export const CHAPTER_IDS = ["03", "05", "06"] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

export type ActorPlacement = "right" | "left" | "none";
export type ScreenAxis = "vertical" | "horizontal";
export type HeaderGroup = "build" | "work" | "competencies" | "studio" | "contact";

export interface GraphPoint {
  x: number;
  y: number;
}

export interface ScreenNode {
  id: ScreenNodeId;
  index: number;
  title: string;
  heading: string;
  kicker: string;
  axis: ScreenAxis;
  chapterId: ChapterId | null;
  chapterIndex: number | null;
  actorPlacement: ActorPlacement;
  dynamic: boolean;
  graph: GraphPoint;
  headerGroup: HeaderGroup | null;
  competenceId?: "content" | "design" | "event" | "games" | "video" | "digital" | "merch";
}

export interface GraphEdge {
  from: ScreenNodeId;
  to: ScreenNodeId;
  /** Orthogonal polyline in graph units, including endpoints. */
  path: readonly GraphPoint[];
}

export interface TemporaryState {
  id: TemporaryStateId;
  host: "03.3";
  title: string;
  graphRing: false;
}

export const GRAPH_DISTANCE_OPACITY = [1, 0.68, 0.34, 0.12, 0] as const;

export const SCREEN_NODES: readonly ScreenNode[] = Object.freeze([
  { id: "01", index: 0, title: "Hero", heading: "Спецпроекты, которые помогают компаниям говорить с людьми", kicker: "Mimicry group", axis: "vertical", chapterId: null, chapterIndex: null, actorPlacement: "right", dynamic: false, graph: { x: 0, y: 0 }, headerGroup: "build" },
  { id: "02", index: 1, title: "О нас", heading: "Мы собираем коммуникацию как систему, а не как набор активностей", kicker: "О нас", axis: "vertical", chapterId: null, chapterIndex: null, actorPlacement: "right", dynamic: false, graph: { x: 0, y: 1 }, headerGroup: "build" },
  { id: "03.1", index: 2, title: "Задача", heading: "Какая у вас задача?", kicker: "Собрать проект", axis: "horizontal", chapterId: "03", chapterIndex: 0, actorPlacement: "right", dynamic: false, graph: { x: 0, y: 2 }, headerGroup: "build" },
  { id: "03.2", index: 3, title: "Компетенции", heading: "Какие компетенции нужны?", kicker: "Собрать проект", axis: "horizontal", chapterId: "03", chapterIndex: 1, actorPlacement: "right", dynamic: true, graph: { x: 1, y: 2 }, headerGroup: "build" },
  { id: "03.3", index: 4, title: "Бриф", heading: "Черновик запроса", kicker: "Собрать проект", axis: "horizontal", chapterId: "03", chapterIndex: 2, actorPlacement: "right", dynamic: true, graph: { x: 2, y: 2 }, headerGroup: "build" },
  { id: "04", index: 5, title: "Кейсы", heading: "Спецпроекты, которые уже работали", kicker: "Кейсы", axis: "vertical", chapterId: null, chapterIndex: null, actorPlacement: "right", dynamic: false, graph: { x: 0, y: 3 }, headerGroup: "work" },
  { id: "05.1", index: 6, title: "Контент", heading: "Контент", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 0, actorPlacement: "left", dynamic: false, graph: { x: 0, y: 4 }, headerGroup: "competencies", competenceId: "content" },
  { id: "05.2", index: 7, title: "Дизайн", heading: "Дизайн", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 1, actorPlacement: "left", dynamic: false, graph: { x: 1, y: 4 }, headerGroup: "competencies", competenceId: "design" },
  { id: "05.3", index: 8, title: "Event", heading: "Event", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 2, actorPlacement: "left", dynamic: false, graph: { x: 2, y: 4 }, headerGroup: "competencies", competenceId: "event" },
  { id: "05.4", index: 9, title: "Игры", heading: "Игры", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 3, actorPlacement: "left", dynamic: false, graph: { x: 3, y: 4 }, headerGroup: "competencies", competenceId: "games" },
  { id: "05.5", index: 10, title: "Видео", heading: "Видео", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 4, actorPlacement: "left", dynamic: false, graph: { x: 4, y: 4 }, headerGroup: "competencies", competenceId: "video" },
  { id: "05.6", index: 11, title: "Digital", heading: "Digital", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 5, actorPlacement: "left", dynamic: false, graph: { x: 5, y: 4 }, headerGroup: "competencies", competenceId: "digital" },
  { id: "05.7", index: 12, title: "Мерч", heading: "Мерч", kicker: "Компетенции", axis: "horizontal", chapterId: "05", chapterIndex: 6, actorPlacement: "left", dynamic: false, graph: { x: 6, y: 4 }, headerGroup: "competencies", competenceId: "merch" },
  { id: "06.1", index: 13, title: "Команда", heading: "Наша команда", kicker: "Студия", axis: "horizontal", chapterId: "06", chapterIndex: 0, actorPlacement: "right", dynamic: false, graph: { x: 0, y: 6 }, headerGroup: "studio" },
  { id: "06.2", index: 14, title: "Партнёры", heading: "Партнёры", kicker: "Студия", axis: "horizontal", chapterId: "06", chapterIndex: 1, actorPlacement: "right", dynamic: false, graph: { x: 1, y: 6 }, headerGroup: "studio" },
  { id: "06.3", index: 15, title: "Клиенты", heading: "Нам доверяют", kicker: "Студия", axis: "horizontal", chapterId: "06", chapterIndex: 2, actorPlacement: "right", dynamic: false, graph: { x: 2, y: 6 }, headerGroup: "studio" },
  { id: "07", index: 16, title: "Контакт", heading: "Связаться с нами", kicker: "Контакт", axis: "vertical", chapterId: null, chapterIndex: null, actorPlacement: "right", dynamic: false, graph: { x: 0, y: 7 }, headerGroup: "contact" },
  { id: "08", index: 17, title: "Футер", heading: "Mimicry group", kicker: "Футер", axis: "vertical", chapterId: null, chapterIndex: null, actorPlacement: "none", dynamic: false, graph: { x: 0, y: 8 }, headerGroup: "contact" },
]);

export const SCREEN_NODE_BY_ID: Readonly<Record<ScreenNodeId, ScreenNode>> = Object.freeze(
  Object.fromEntries(SCREEN_NODES.map((node) => [node.id, node])) as Record<ScreenNodeId, ScreenNode>,
);

export const TEMPORARY_STATES: readonly TemporaryState[] = Object.freeze([
  { id: "03.3A", host: "03.3", title: "Контактная форма", graphRing: false },
  { id: "03.3B", host: "03.3", title: "Заявка принята", graphRing: false },
]);

function segment(from: ScreenNodeId, to: ScreenNodeId, path: GraphPoint[]): GraphEdge {
  return { from, to, path: Object.freeze(path) };
}

function nodePoint(id: ScreenNodeId): GraphPoint {
  return SCREEN_NODE_BY_ID[id].graph;
}

function h(from: ScreenNodeId, to: ScreenNodeId): GraphEdge {
  const a = nodePoint(from);
  const b = nodePoint(to);
  return segment(from, to, [a, { x: b.x, y: a.y }, b].filter((point, index, list) => {
    if (index === 0) return true;
    const prev = list[index - 1];
    return point.x !== prev.x || point.y !== prev.y;
  }));
}

function v(from: ScreenNodeId, to: ScreenNodeId): GraphEdge {
  const a = nodePoint(from);
  const b = nodePoint(to);
  return segment(from, to, [a, { x: a.x, y: b.y }, b].filter((point, index, list) => {
    if (index === 0) return true;
    const prev = list[index - 1];
    return point.x !== prev.x || point.y !== prev.y;
  }));
}

/**
 * Topology neighbours plus orthogonal elbows that do not sit on other rings.
 * 05.7 → 06.1 uses the empty y=5 highway so the connector does not cross 06 rings.
 */
export const GRAPH_EDGES: readonly GraphEdge[] = Object.freeze([
  v("01", "02"),
  v("02", "03.1"),
  h("03.1", "03.2"),
  h("03.2", "03.3"),
  segment("03.3", "04", [nodePoint("03.3"), { x: 2, y: 3 }, nodePoint("04")]),
  v("04", "05.1"),
  h("05.1", "05.2"),
  h("05.2", "05.3"),
  h("05.3", "05.4"),
  h("05.4", "05.5"),
  h("05.5", "05.6"),
  h("05.6", "05.7"),
  segment("05.7", "06.1", [nodePoint("05.7"), { x: 6, y: 5 }, { x: 0, y: 5 }, nodePoint("06.1")]),
  h("06.1", "06.2"),
  h("06.2", "06.3"),
  segment("06.3", "07", [nodePoint("06.3"), { x: 2, y: 7 }, nodePoint("07")]),
  v("07", "08"),
]);

export const HEADER_LINKS: readonly { group: HeaderGroup; label: string; target: ScreenNodeId }[] = Object.freeze([
  { group: "build", label: "Проект", target: "03.1" },
  { group: "work", label: "Кейсы", target: "04" },
  { group: "competencies", label: "Компетенции", target: "05.1" },
  { group: "studio", label: "Студия", target: "06.1" },
  { group: "contact", label: "Контакт", target: "07" },
]);

export const HERO_ANCHORS = Object.freeze({
  build: "03.1" as const,
  competence: "05.1" as const,
});

export const SVG_OVERRIDES = Object.freeze({
  footerActor: "SVG showed Mimic on 08; owner instruction removes the actor from the footer.",
  headerOnFooter: "Header remains on footer; not a per-screen copy.",
  screensAreResponsive: "16:9 is a desktop approval profile, not a letterboxed frame.",
  copyIsProvisional: "SVG labels are fixtures, not production brand copy.",
});

export function isScreenNodeId(value: string): value is ScreenNodeId {
  return SCREEN_NODE_BY_ID[value as ScreenNodeId] !== undefined;
}

export function chapterNodes(chapterId: ChapterId): readonly ScreenNode[] {
  return SCREEN_NODES.filter((node) => node.chapterId === chapterId);
}

export function assertOrthogonalPath(path: readonly GraphPoint[]) {
  if (path.length < 2) throw new Error("Graph path needs at least two points");
  for (let index = 1; index < path.length; index += 1) {
    const prev = path[index - 1];
    const next = path[index];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (dx !== 0 && dy !== 0) throw new Error(`Diagonal graph segment ${prev.x},${prev.y} → ${next.x},${next.y}`);
    if (dx === 0 && dy === 0) throw new Error("Zero-length graph segment");
  }
}

export function topologyNeighbors(id: ScreenNodeId): ScreenNodeId[] {
  const next: ScreenNodeId[] = [];
  for (const edge of GRAPH_EDGES) {
    if (edge.from === id) next.push(edge.to);
    if (edge.to === id) next.push(edge.from);
  }
  return next;
}

export function graphDistance(from: ScreenNodeId, to: ScreenNodeId): number {
  if (from === to) return 0;
  const queue: ScreenNodeId[] = [from];
  const seen = new Map<ScreenNodeId, number>([[from, 0]]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = seen.get(current)!;
    for (const neighbor of topologyNeighbors(current)) {
      if (seen.has(neighbor)) continue;
      if (neighbor === to) return depth + 1;
      seen.set(neighbor, depth + 1);
      queue.push(neighbor);
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function opacityForDistance(distance: number) {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  if (distance >= GRAPH_DISTANCE_OPACITY.length) return 0;
  return GRAPH_DISTANCE_OPACITY[distance] ?? 0;
}
