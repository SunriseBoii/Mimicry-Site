import {
  CHAPTER_IDS,
  SCREEN_NODES,
  SCREEN_NODE_BY_ID,
  SCREEN_NODE_IDS,
  TEMPORARY_STATE_IDS,
  type ChapterId,
  type ScreenNode,
  type ScreenNodeId,
} from "./topology";
import { isNodeUnlocked, type UnlockFlags } from "./graph-model";

export const HYSTERESIS = 0.12;
export const VIEWPORT_CSS = "100svh";

export interface LayoutSegment {
  id: ScreenNodeId;
  start: number;
  length: number;
}

export interface ChapterLayout {
  id: ChapterId;
  start: number;
  length: number;
  panelIds: ScreenNodeId[];
  panelCount: number;
}

export interface CanonicalLayout {
  viewportHeight: number;
  documentHeight: number;
  segments: LayoutSegment[];
  byId: Record<ScreenNodeId, LayoutSegment | undefined>;
  chapters: Record<ChapterId, ChapterLayout | undefined>;
}

export interface ScrollProgress {
  scrollY: number;
  viewportHeight: number;
  viewportWidth: number;
  activeNodeId: ScreenNodeId;
  nextNodeId: ScreenNodeId | null;
  previousNodeId: ScreenNodeId | null;
  edgeProgress: number;
  chapterLocal: Record<ChapterId, number>;
  chapterTranslate: Record<ChapterId, number>;
  direction: 1 | -1;
  documentHeight: number;
  revision: number;
}

export function unlockedSequence(unlock: UnlockFlags): ScreenNode[] {
  return SCREEN_NODES.filter((node) => isNodeUnlocked(node.id, unlock));
}

function grouped(sequence: ScreenNode[]): Array<{ chapterId: ChapterId | null; nodes: ScreenNode[] }> {
  const groups: Array<{ chapterId: ChapterId | null; nodes: ScreenNode[] }> = [];
  for (const node of sequence) {
    const last = groups[groups.length - 1];
    if (node.chapterId && last && last.chapterId === node.chapterId) {
      last.nodes.push(node);
    } else {
      groups.push({ chapterId: node.chapterId, nodes: [node] });
    }
  }
  return groups;
}

export function canonicalLayout(viewportHeight: number, unlock: UnlockFlags): CanonicalLayout {
  const vh = Math.max(1, viewportHeight);
  const sequence = unlockedSequence(unlock);
  const segments: LayoutSegment[] = [];
  const chapters = {} as CanonicalLayout["chapters"];
  let y = 0;
  for (const group of grouped(sequence)) {
    if (!group.chapterId || group.nodes.length === 1) {
      for (const node of group.nodes) {
        const segment = { id: node.id, start: y, length: vh };
        segments.push(segment);
        y += vh;
      }
      continue;
    }
    const panelCount = group.nodes.length;
    const length = panelCount * vh;
    chapters[group.chapterId] = {
      id: group.chapterId,
      start: y,
      length,
      panelIds: group.nodes.map((node) => node.id),
      panelCount,
    };
    for (let index = 0; index < group.nodes.length; index += 1) {
      segments.push({
        id: group.nodes[index].id,
        start: y + index * vh,
        length: vh,
      });
    }
    y += length;
  }
  const byId = {} as CanonicalLayout["byId"];
  for (const segment of segments) byId[segment.id] = segment;
  return { viewportHeight: vh, documentHeight: y, segments, byId, chapters };
}

export function canonicalTarget(layout: CanonicalLayout, id: ScreenNodeId) {
  return layout.byId[id]?.start ?? 0;
}

function rawIndexAt(scrollY: number, layout: CanonicalLayout) {
  const y = Math.min(Math.max(0, scrollY), Math.max(0, layout.documentHeight - 1));
  let index = 0;
  for (let i = 0; i < layout.segments.length; i += 1) {
    const segment = layout.segments[i];
    if (y >= segment.start) index = i;
  }
  return index;
}

export function mapScrollToProgress(args: {
  scrollY: number;
  viewportHeight: number;
  viewportWidth: number;
  unlock: UnlockFlags;
  previousActive?: ScreenNodeId;
  direction?: 1 | -1;
  ignoreHysteresis?: boolean;
}): ScrollProgress {
  const layout = canonicalLayout(args.viewportHeight, args.unlock);
  const direction = args.direction ?? 1;
  const raw = rawIndexAt(args.scrollY, layout);
  const probed = rawIndexAt(args.scrollY - direction * args.viewportHeight * HYSTERESIS, layout);
  let index = raw;
  if (!args.ignoreHysteresis) {
    const previousIndex = args.previousActive
      ? layout.segments.findIndex((segment) => segment.id === args.previousActive)
      : -1;
    if (previousIndex >= 0 && previousIndex === raw) {
      index = raw;
    } else if (previousIndex >= 0 && Math.abs(raw - previousIndex) > 1) {
      index = raw;
    } else {
      index = probed;
    }
  }
  index = Math.min(layout.segments.length - 1, Math.max(0, index));
  if (raw === layout.segments.length - 1) index = raw;
  const active = layout.segments[index];
  const next = layout.segments[index + 1] ?? null;
  const previous = layout.segments[index - 1] ?? null;
  const edgeProgress = next
    ? Math.min(1, Math.max(0, (args.scrollY - active.start) / active.length))
    : 0;
  const chapterLocal = { "03": 0, "05": 0, "06": 0 } as Record<ChapterId, number>;
  const chapterTranslate = { "03": 0, "05": 0, "06": 0 } as Record<ChapterId, number>;
  for (const id of CHAPTER_IDS) {
    const chapter = layout.chapters[id];
    if (!chapter) {
      const lone = layout.segments.find((segment) => SCREEN_NODE_BY_ID[segment.id].chapterId === id);
      if (lone) {
        chapterLocal[id] = 0;
        chapterTranslate[id] = 0;
      }
      continue;
    }
    const local = (args.scrollY - chapter.start) / args.viewportHeight;
    const clamped = Math.min(Math.max(local, 0), Math.max(0, chapter.panelCount - 1));
    chapterLocal[id] = clamped;
    chapterTranslate[id] = -clamped;
  }
  return {
    scrollY: args.scrollY,
    viewportHeight: args.viewportHeight,
    viewportWidth: args.viewportWidth,
    activeNodeId: active.id,
    nextNodeId: next?.id ?? null,
    previousNodeId: previous?.id ?? null,
    edgeProgress,
    chapterLocal,
    chapterTranslate,
    direction,
    documentHeight: layout.documentHeight,
    revision: 0,
  };
}

export function restoreScrollY(layout: CanonicalLayout, nodeId: ScreenNodeId, edgeProgress: number) {
  const segment = layout.byId[nodeId];
  if (!segment) return 0;
  const inner = segment.start + Math.min(1, Math.max(0, edgeProgress)) * Math.max(0, segment.length - 1);
  if (inner <= segment.start + 1) return Math.min(segment.start + 2, Math.max(segment.start, segment.start + segment.length - 2));
  return inner;
}

export function compensateUnlock(args: {
  scrollY: number;
  viewportHeight: number;
  viewportWidth: number;
  previous: UnlockFlags;
  next: UnlockFlags;
  previousActive?: ScreenNodeId;
  direction?: 1 | -1;
}) {
  const before = mapScrollToProgress({
    scrollY: args.scrollY,
    viewportHeight: args.viewportHeight,
    viewportWidth: args.viewportWidth,
    unlock: args.previous,
    previousActive: args.previousActive,
    direction: args.direction,
  });
  const afterLayout = canonicalLayout(args.viewportHeight, args.next);
  return restoreScrollY(afterLayout, before.activeNodeId, before.edgeProgress);
}

export const MAGNETISM = Object.freeze({
  inputIdleMs: 160,
  activationRadiusFactor: 0.25,
  noopDistancePx: 2,
  snapDurationMs: 340,
  maxProjectionFactor: 0.18,
  fastVelocityPxPerMs: 0.85,
  directionConfidencePx: 28,
  unlockSettleMs: 48,
});

export type ScrollMode = "idle" | "user" | "magnetic" | "programmatic" | "restore";
export type ScrollOrigin = "programmatic" | "restore";
export type UserInputKind = "wheel" | "touch" | "pointer" | "keyboard" | "scrollbar";

export interface MagneticPlan {
  nodeId: ScreenNodeId;
  targetY: number;
  distance: number;
  rawId: ScreenNodeId;
}

export interface MagnetismGuards {
  dialogOpen: boolean;
  pointerHeld: boolean;
  focusEditing: boolean;
  textSelecting: boolean;
  documentHidden: boolean;
  layoutSettling: boolean;
  unmounted: boolean;
}

export interface MagnetismSnapshot {
  mode: ScrollMode;
  candidateId: ScreenNodeId | null;
  distancePx: number;
  velocityPxPerMs: number;
  revision: number;
  suppressed: boolean;
  lastInput: UserInputKind | null;
}

export interface ScrollHost {
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
  scrollTo(options: ScrollToOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(handler: TimerHandler, timeout?: number): number;
  clearTimeout(handle?: number): void;
}

const EMPTY_GUARDS: MagnetismGuards = {
  dialogOpen: false,
  pointerHeld: false,
  focusEditing: false,
  textSelecting: false,
  documentHidden: false,
  layoutSettling: false,
  unmounted: false,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function magneticEaseOut(t: number) {
  const unit = Math.min(1, Math.max(0, t));
  return 1 - (1 - unit) ** 3;
}

export function isMagneticEligible(id: string, unlock: UnlockFlags) {
  if ((TEMPORARY_STATE_IDS as readonly string[]).includes(id)) return false;
  if (!(id in SCREEN_NODE_BY_ID)) return false;
  return isNodeUnlocked(id as ScreenNodeId, unlock);
}

export function magnetismGuardsBlock(guards: MagnetismGuards) {
  return guards.dialogOpen
    || guards.pointerHeld
    || guards.focusEditing
    || guards.textSelecting
    || guards.documentHidden
    || guards.layoutSettling
    || guards.unmounted;
}

export function planMagneticSnap(args: {
  scrollY: number;
  viewportHeight: number;
  unlock: UnlockFlags;
  direction: 1 | -1;
  velocityPxPerMs: number;
  fullyStopped: boolean;
  lastConfidentDirection: 1 | -1;
  fastGesture?: boolean;
}): MagneticPlan | null {
  const vh = Math.max(1, args.viewportHeight);
  const layout = canonicalLayout(vh, args.unlock);
  if (layout.segments.length === 0) return null;
  const maxProj = vh * MAGNETISM.maxProjectionFactor;
  const projection = args.fullyStopped
    ? 0
    : clamp(args.velocityPxPerMs * MAGNETISM.inputIdleMs, -maxProj, maxProj);
  const probeY = clamp(args.scrollY + projection, 0, Math.max(0, layout.documentHeight - 1));
  const rawIndex = rawIndexAt(probeY, layout);
  const raw = layout.segments[rawIndex];
  if (!raw) return null;
  const neighborIds: ScreenNodeId[] = [raw.id];
  if (layout.segments[rawIndex - 1]) neighborIds.push(layout.segments[rawIndex - 1].id);
  if (layout.segments[rawIndex + 1]) neighborIds.push(layout.segments[rawIndex + 1].id);
  const unique = [...new Set(neighborIds)].filter((id) => isMagneticEligible(id, args.unlock));
  let candidates = unique.map((id) => {
    const targetY = restoreScrollY(layout, id, 0);
    return { nodeId: id, targetY, distance: Math.abs(args.scrollY - targetY), rawId: raw.id };
  });
  if (args.fastGesture) {
    const dir = args.lastConfidentDirection;
    candidates = candidates.filter((item) => (
      dir === 1
        ? item.targetY >= args.scrollY - MAGNETISM.noopDistancePx
        : item.targetY <= args.scrollY + MAGNETISM.noopDistancePx
    ));
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (best.distance <= MAGNETISM.noopDistancePx) return null;
  if (best.distance > vh * MAGNETISM.activationRadiusFactor) return null;
  return best;
}

function editingElement(node: Element | null) {
  if (!node || !(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT";
}

export type DiscreteListener = (progress: ScrollProgress) => void;

export class ScrollCompositionController {
  constructor(private readonly timeSource?: { now: () => number }) {}

  private unlock: UnlockFlags = { competencies: false, brief: false };
  private reducedMotion = false;
  private viewport = { width: 1440, height: 900 };
  private direction: 1 | -1 = 1;
  private lastY = 0;
  private snapshot: ScrollProgress = mapScrollToProgress({
    scrollY: 0,
    viewportHeight: 900,
    viewportWidth: 1440,
    unlock: { competencies: false, brief: false },
  });
  private raf = 0;
  private scheduled = false;
  private skipHysteresis = false;
  private pendingTarget: ScreenNodeId | null = null;
  private readonly discrete = new Set<DiscreteListener>();
  private readonly frame = new Set<DiscreteListener>();
  private attached: ScrollHost | null = null;
  private progressRevision = 0;
  private mode: ScrollMode = "idle";
  private magnetToken = 0;
  private magnetRaf = 0;
  private idleTimer = 0;
  private unlockTimer = 0;
  private velocity = 0;
  private lastScrollAt = 0;
  private lastConfidentDirection: 1 | -1 = 1;
  private fastGesture = false;
  private lastInput: UserInputKind | null = null;
  private candidate: MagneticPlan | null = null;
  private guards: MagnetismGuards = { ...EMPTY_GUARDS };
  private supportsScrollEnd = false;
  private onScroll = () => this.queue();
  private onResize = () => this.resize();
  private onScrollEnd = () => this.onInputIdle();
  private onWheel = () => this.noteUserInput("wheel");
  private onTouch = () => this.noteUserInput("touch");
  private onPointerDown = () => {
    this.guards.pointerHeld = true;
    this.noteUserInput("pointer");
  };
  private onPointerUp = () => {
    this.guards.pointerHeld = false;
  };
  private onKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (editingElement(event.target instanceof Element ? event.target : null)) return;
    const keys = [" ", "Spacebar", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    this.noteUserInput("keyboard");
  };

  getProgress() {
    return this.snapshot;
  }

  getUnlock() {
    return this.unlock;
  }

  getMode() {
    return this.mode;
  }

  getMagnetism(): MagnetismSnapshot {
    return {
      mode: this.mode,
      candidateId: this.candidate?.nodeId ?? null,
      distancePx: this.candidate?.distance ?? 0,
      velocityPxPerMs: this.velocity,
      revision: this.magnetToken,
      suppressed: magnetismGuardsBlock(this.liveGuards()),
      lastInput: this.lastInput,
    };
  }

  setMagnetismGuards(partial: Partial<MagnetismGuards>) {
    this.guards = { ...this.guards, ...partial };
    if (partial.dialogOpen) this.cancelMagnetism("idle");
  }

  subscribeDiscrete(listener: DiscreteListener) {
    this.discrete.add(listener);
    return () => { this.discrete.delete(listener); };
  }

  subscribeFrame(listener: DiscreteListener) {
    this.frame.add(listener);
    return () => { this.frame.delete(listener); };
  }

  attach(target: ScrollHost = window) {
    if (this.attached) this.detach();
    this.guards.unmounted = false;
    this.attached = target;
    this.viewport = { width: target.innerWidth, height: target.innerHeight };
    this.lastY = target.scrollY;
    this.supportsScrollEnd = typeof target === "object" && target !== null && "onscrollend" in target;
    target.addEventListener("scroll", this.onScroll, { passive: true });
    target.addEventListener("resize", this.onResize);
    target.addEventListener("wheel", this.onWheel, { passive: true, capture: true });
    target.addEventListener("touchstart", this.onTouch, { passive: true, capture: true });
    target.addEventListener("touchmove", this.onTouch, { passive: true, capture: true });
    target.addEventListener("pointerdown", this.onPointerDown, { capture: true });
    target.addEventListener("pointerup", this.onPointerUp, { capture: true });
    target.addEventListener("pointercancel", this.onPointerUp, { capture: true });
    target.addEventListener("keydown", this.onKeyDown, { capture: true });
    if (this.supportsScrollEnd) target.addEventListener("scrollend", this.onScrollEnd);
    this.sync(true);
    return () => this.detach();
  }

  detach() {
    const host = this.attached;
    if (!host) {
      this.guards.unmounted = true;
      this.cancelMagnetism("idle");
      this.clearIdle();
      return;
    }
    host.removeEventListener("scroll", this.onScroll);
    host.removeEventListener("resize", this.onResize);
    host.removeEventListener("wheel", this.onWheel, true);
    host.removeEventListener("touchstart", this.onTouch, true);
    host.removeEventListener("touchmove", this.onTouch, true);
    host.removeEventListener("pointerdown", this.onPointerDown, true);
    host.removeEventListener("pointerup", this.onPointerUp, true);
    host.removeEventListener("pointercancel", this.onPointerUp, true);
    host.removeEventListener("keydown", this.onKeyDown, true);
    if (this.supportsScrollEnd) host.removeEventListener("scrollend", this.onScrollEnd);
    host.cancelAnimationFrame(this.raf);
    this.cancelMagnetism("idle");
    this.clearIdle();
    if (this.unlockTimer) host.clearTimeout(this.unlockTimer);
    this.attached = null;
    this.scheduled = false;
    this.guards.unmounted = true;
  }

  setUnlock(unlock: UnlockFlags) {
    if (this.unlock.competencies === unlock.competencies && this.unlock.brief === unlock.brief) return;
    const host = this.attached;
    this.guards.layoutSettling = true;
    if (host) {
      const nextY = compensateUnlock({
        scrollY: host.scrollY,
        viewportHeight: this.viewport.height,
        viewportWidth: this.viewport.width,
        previous: this.unlock,
        next: unlock,
        previousActive: this.snapshot.activeNodeId,
        direction: this.direction,
      });
      this.unlock = unlock;
      if (Math.abs(nextY - host.scrollY) > 0.5) host.scrollTo({ top: nextY, behavior: "auto" });
      this.skipHysteresis = true;
      this.sync(true);
      this.skipHysteresis = false;
      this.armUnlockSettle();
    } else {
      this.unlock = unlock;
      this.sync(true);
      this.guards.layoutSettling = false;
    }
  }

  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
  }

  layout() {
    return canonicalLayout(this.viewport.height, this.unlock);
  }

  noteUserInput(kind: UserInputKind) {
    if (this.guards.unmounted) return;
    if (this.mode === "idle" || this.mode === "magnetic") this.fastGesture = false;
    this.lastInput = kind;
    this.cancelMagnetism("user");
    this.mode = "user";
    this.progressRevision += 1;
    this.armIdle();
  }

  evaluateMagnetism() {
    this.onInputIdle();
  }

  scrollToNode(id: ScreenNodeId, behavior?: ScrollBehavior, origin: ScrollOrigin = "programmatic") {
    const layout = this.layout();
    const top = restoreScrollY(layout, id, 0);
    if (
      this.pendingTarget === id
      && (this.mode === "programmatic" || this.mode === "restore")
      && Math.abs(this.lastY - top) <= MAGNETISM.noopDistancePx
    ) {
      return;
    }
    if (
      this.snapshot.activeNodeId === id
      && Math.abs(this.lastY - top) <= MAGNETISM.noopDistancePx
      && this.mode !== "magnetic"
      && this.mode !== "user"
    ) {
      return;
    }
    this.cancelMagnetism(origin);
    this.clearIdle();
    this.mode = origin;
    this.fastGesture = false;
    this.pendingTarget = id;
    const host = this.attached;
    const resolved = behavior ?? (this.reducedMotion ? "auto" : "smooth");
    if (host) {
      const html = typeof document !== "undefined" ? document.documentElement : null;
      const previous = html?.style.scrollBehavior ?? "";
      if (resolved !== "smooth" && html) html.style.scrollBehavior = "auto";
      host.scrollTo({ top, behavior: resolved === "smooth" ? "smooth" : "auto" });
      this.skipHysteresis = true;
      if (resolved !== "smooth") {
        if (html) {
          html.style.scrollBehavior = previous;
          html.dataset.m4Smooth = "false";
        }
        this.sync(true);
      } else {
        if (html) html.dataset.m4Smooth = "true";
        this.sync(true);
      }
      this.skipHysteresis = false;
    } else {
      this.skipHysteresis = true;
      this.applyScroll(top, true);
      this.skipHysteresis = false;
      this.mode = "idle";
      this.pendingTarget = null;
    }
  }

  private liveGuards(): MagnetismGuards {
    const next = { ...this.guards };
    if (typeof document !== "undefined") {
      next.documentHidden = document.hidden || next.documentHidden;
      next.focusEditing = editingElement(document.activeElement) || next.focusEditing;
      const selection = document.getSelection();
      next.textSelecting = Boolean(selection && selection.type === "Range" && (selection.toString()?.length ?? 0) > 0) || next.textSelecting;
    }
    next.unmounted = !this.attached || next.unmounted;
    return next;
  }

  private now() {
    return this.timeSource?.now() ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
  }

  private armIdle() {
    this.clearIdle();
    const host = this.attached;
    if (!host) return;
    this.idleTimer = host.setTimeout(() => this.onInputIdle(), MAGNETISM.inputIdleMs);
  }

  private clearIdle() {
    if (!this.idleTimer) return;
    this.attached?.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  private armUnlockSettle() {
    const host = this.attached;
    if (!host) {
      this.guards.layoutSettling = false;
      return;
    }
    if (this.unlockTimer) host.clearTimeout(this.unlockTimer);
    this.unlockTimer = host.setTimeout(() => {
      this.guards.layoutSettling = false;
      this.unlockTimer = 0;
    }, MAGNETISM.unlockSettleMs);
  }

  private onInputIdle() {
    if (this.mode !== "user") return;
    if (this.guards.pointerHeld) return;
    if (magnetismGuardsBlock(this.liveGuards())) {
      this.mode = "idle";
      this.candidate = null;
      return;
    }
    const fullyStopped = Math.abs(this.velocity) < 0.04;
    const plan = planMagneticSnap({
      scrollY: this.lastY,
      viewportHeight: this.viewport.height,
      unlock: this.unlock,
      direction: this.direction,
      velocityPxPerMs: this.velocity,
      fullyStopped,
      lastConfidentDirection: this.lastConfidentDirection,
      fastGesture: this.fastGesture,
    });
    this.candidate = plan;
    if (!plan) {
      this.mode = "idle";
      this.fastGesture = false;
      return;
    }
    this.beginMagnetic(plan);
  }

  private beginMagnetic(plan: MagneticPlan) {
    const host = this.attached;
    this.mode = "magnetic";
    this.magnetToken += 1;
    const token = this.magnetToken;
    this.pendingTarget = plan.nodeId;
    this.skipHysteresis = true;
    if (!host || this.reducedMotion || Math.abs(plan.targetY - this.lastY) <= MAGNETISM.noopDistancePx) {
      if (host) host.scrollTo({ top: plan.targetY, behavior: "auto" });
      else this.applyScroll(plan.targetY, true);
      this.finishMagnetic(token);
      return;
    }
    const from = this.lastY;
    const start = this.now();
    const duration = MAGNETISM.snapDurationMs;
    const tick = (stamp: number) => {
      if (token !== this.magnetToken || this.mode !== "magnetic") return;
      const t = Math.min(1, (stamp - start) / duration);
      const y = from + (plan.targetY - from) * magneticEaseOut(t);
      host.scrollTo({ top: y, behavior: "auto" });
      if (t < 1) this.magnetRaf = host.requestAnimationFrame(tick);
      else this.finishMagnetic(token);
    };
    this.magnetRaf = host.requestAnimationFrame(tick);
  }

  private finishMagnetic(token: number) {
    if (token !== this.magnetToken) return;
    this.mode = "idle";
    this.pendingTarget = null;
    this.skipHysteresis = false;
    this.fastGesture = false;
    this.clearIdle();
    this.sync(true);
  }

  private cancelMagnetism(next: ScrollMode | "user" | "idle" | ScrollOrigin) {
    this.magnetToken += 1;
    if (this.magnetRaf && this.attached) {
      this.attached.cancelAnimationFrame(this.magnetRaf);
      this.magnetRaf = 0;
    }
    if (this.mode === "magnetic") this.pendingTarget = null;
    if (next === "user" || next === "idle" || next === "programmatic" || next === "restore") {
      this.mode = next;
    }
  }

  private queue() {
    if (this.scheduled || !this.attached) return;
    this.scheduled = true;
    this.raf = this.attached.requestAnimationFrame(() => {
      this.scheduled = false;
      this.sync(false);
    });
  }

  private resize() {
    if (!this.attached) return;
    const previous = this.snapshot;
    this.viewport = { width: this.attached.innerWidth, height: this.attached.innerHeight };
    const nextLayout = canonicalLayout(this.viewport.height, this.unlock);
    const y = restoreScrollY(nextLayout, previous.activeNodeId, previous.edgeProgress);
    this.cancelMagnetism("restore");
    this.clearIdle();
    this.attached.scrollTo({ top: y, behavior: "auto" });
    this.skipHysteresis = true;
    this.sync(true);
    this.skipHysteresis = false;
    this.mode = "idle";
    this.pendingTarget = null;
  }

  private applyScroll(scrollY: number, forceDiscrete: boolean) {
    const now = this.now();
    const dt = Math.max(1, now - (this.lastScrollAt || now));
    const dy = scrollY - this.lastY;
    if (this.lastScrollAt) this.velocity = dy / dt;
    if (Math.abs(dy) >= MAGNETISM.directionConfidencePx) {
      this.lastConfidentDirection = dy > 0 ? 1 : -1;
      if (Math.abs(this.velocity) >= MAGNETISM.fastVelocityPxPerMs) this.fastGesture = true;
    }
    if (scrollY > this.lastY + 0.4) this.direction = 1;
    else if (scrollY < this.lastY - 0.4) this.direction = -1;
    this.lastY = scrollY;
    this.lastScrollAt = now;
    const programmatic = this.mode === "programmatic" || this.mode === "restore" || this.mode === "magnetic";
    const next = mapScrollToProgress({
      scrollY,
      viewportHeight: this.viewport.height,
      viewportWidth: this.viewport.width,
      unlock: this.unlock,
      previousActive: this.snapshot.activeNodeId,
      direction: this.direction,
      ignoreHysteresis: this.skipHysteresis || this.pendingTarget !== null || programmatic,
    });
    if (this.pendingTarget && next.activeNodeId === this.pendingTarget) {
      const targetY = restoreScrollY(this.layout(), this.pendingTarget, 0);
      if (this.mode === "programmatic" || this.mode === "restore") {
        if (Math.abs(scrollY - targetY) <= 8) {
          this.pendingTarget = null;
          this.mode = "idle";
          this.clearIdle();
          if (typeof document !== "undefined") document.documentElement.dataset.m4Smooth = "false";
        }
      } else if (this.mode !== "magnetic") {
        this.pendingTarget = null;
        if (typeof document !== "undefined") document.documentElement.dataset.m4Smooth = "false";
      }
    }
    const changed = next.activeNodeId !== this.snapshot.activeNodeId
      || next.nextNodeId !== this.snapshot.nextNodeId
      || forceDiscrete;
    this.progressRevision += 1;
    this.snapshot = { ...next, revision: this.progressRevision };
    this.writeCss(next);
    for (const listener of this.frame) listener(next);
    if (changed) {
      for (const listener of this.discrete) listener(next);
    }
  }

  private sync(forceDiscrete: boolean) {
    const scrollY = this.attached ? this.attached.scrollY : this.lastY;
    this.applyScroll(scrollY, forceDiscrete);
  }

  private writeCss(progress: ScrollProgress) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--m4-vh", `${progress.viewportHeight}px`);
    root.style.setProperty("--m4-edge", String(progress.edgeProgress));
    for (const id of CHAPTER_IDS) {
      root.style.setProperty(`--m4-ch-${id}-x`, `${progress.chapterTranslate[id] * 100}%`);
      const count = this.layout().chapters[id]?.panelCount
        ?? unlockedSequence(this.unlock).filter((node) => node.chapterId === id).length
        ?? 1;
      root.style.setProperty(`--m4-ch-${id}-count`, String(Math.max(1, count)));
    }
    root.dataset.m4Node = progress.activeNodeId;
    root.dataset.m4ScrollMode = this.mode;
  }
}

export function nextUnlocked(id: ScreenNodeId, unlock: UnlockFlags): ScreenNodeId | null {
  const sequence = unlockedSequence(unlock);
  const index = sequence.findIndex((node) => node.id === id);
  return sequence[index + 1]?.id ?? null;
}

export function previousUnlocked(id: ScreenNodeId, unlock: UnlockFlags): ScreenNodeId | null {
  const sequence = unlockedSequence(unlock);
  const index = sequence.findIndex((node) => node.id === id);
  return sequence[index - 1]?.id ?? null;
}

export function assertMonotonic(layout: CanonicalLayout) {
  let previous = -1;
  for (const id of SCREEN_NODE_IDS) {
    const segment = layout.byId[id];
    if (!segment) continue;
    if (segment.start < previous) throw new Error(`Canonical position for ${id} is not monotonic`);
    previous = segment.start;
  }
}
