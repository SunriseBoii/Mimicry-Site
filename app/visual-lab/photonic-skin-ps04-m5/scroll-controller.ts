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
import { displayedNode, pageTransition, smooth, TRANSITION, unit, type PageTransition } from '../../_ps05/transition';
import { SceneNavigation, type SceneSnapshot } from '../../_ps05/scene-navigation';

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
  scene?: SceneSnapshot;
  transition?: PageTransition;
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
  layout?: CanonicalLayout;
  scrollY: number;
  viewportHeight: number;
  viewportWidth: number;
  unlock: UnlockFlags;
  previousActive?: ScreenNodeId;
  direction?: 1 | -1;
  ignoreHysteresis?: boolean;
}): ScrollProgress {
  const layout = args.layout ?? canonicalLayout(args.viewportHeight, args.unlock);
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
const LATE_USER_SCROLL_GRACE_MS = 3000;

export const MAGNETISM_VARIANTS = Object.freeze({
  a: { inputIdleMs: 160, activationRadiusFactor: 0.25, snapDurationMs: 340 },
  b: { inputIdleMs: 160, activationRadiusFactor: 0.28, snapDurationMs: 440 },
  c: { inputIdleMs: 175, activationRadiusFactor: 0.3, snapDurationMs: 520 },
} as const);

export type MagnetismVariantId = keyof typeof MAGNETISM_VARIANTS;

export const SELECTED_MAGNETISM_VARIANT: MagnetismVariantId = "a";

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
  tokens?: {
    inputIdleMs: number;
    activationRadiusFactor: number;
    noopDistancePx: number;
    maxProjectionFactor: number;
  };
}): MagneticPlan | null {
  const tokens = args.tokens ?? MAGNETISM;
  const vh = Math.max(1, args.viewportHeight);
  const layout = canonicalLayout(vh, args.unlock);
  if (layout.segments.length === 0) return null;
  const maxProj = vh * tokens.maxProjectionFactor;
  const projection = args.fullyStopped
    ? 0
    : clamp(args.velocityPxPerMs * tokens.inputIdleMs, -maxProj, maxProj);
  const probeY = clamp(args.scrollY + projection, 0, Math.max(0, layout.documentHeight - 1));
  const rawIndex = rawIndexAt(probeY, layout);
  const raw = layout.segments[rawIndex];
  if (!raw) return null;
  const neighborIds: ScreenNodeId[] = [raw.id];
  if (layout.segments[rawIndex - 1]) neighborIds.push(layout.segments[rawIndex - 1].id);
  if (layout.segments[rawIndex + 1]) neighborIds.push(layout.segments[rawIndex + 1].id);
  const unique = [...new Set(neighborIds)].filter((id) => isMagneticEligible(id, args.unlock));
  const nearby = unique.map((id) => {
    const targetY = restoreScrollY(layout, id, 0);
    return { nodeId: id, targetY, distance: Math.abs(args.scrollY - targetY), rawId: raw.id };
  });
  let candidates = nearby;
  if (args.fastGesture) {
    const dir = args.lastConfidentDirection;
    candidates = candidates.filter((item) => (
      dir === 1
        ? item.targetY >= args.scrollY - tokens.noopDistancePx
        : item.targetY <= args.scrollY + tokens.noopDistancePx
    ));
    // A previous route can leave the confident direction opposite to the
    // current wheel gesture. Only fall back when that filter cannot reach an
    // anchor in range, and keep the current gesture's direction authoritative.
    if (args.direction !== dir && !candidates.some((item) => item.distance <= vh * tokens.activationRadiusFactor)) {
      candidates = nearby.filter((item) => (
        args.direction === 1
          ? item.targetY >= args.scrollY - tokens.noopDistancePx
          : item.targetY <= args.scrollY + tokens.noopDistancePx
      ));
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  if (best.distance <= tokens.noopDistancePx) return null;
  if (best.distance > vh * tokens.activationRadiusFactor) return null;
  return best;
}

function editingElement(node: Element | null) {
  if (!node || !(node instanceof HTMLElement)) return false;
  if (node.isContentEditable) return true;
  return node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT";
}

export type DiscreteListener = (progress: ScrollProgress) => void;

export class ScrollCompositionController {
  private scenes:SceneNavigation|null=null;
  private detachScenes:(()=>void)|null=null;
  private sceneReady:((id:ScreenNodeId)=>boolean)|null=null;
  setSceneReady(ready:((id:ScreenNodeId)=>boolean)|null){this.sceneReady=ready;}
  setScenes(enabled:boolean) {
    this.setContinuous(false);
    this.scenes=enabled?new SceneNavigation({host:()=>this.attached,layout:()=>this.layout(),now:()=>this.now(),notify:()=>this.sync(false),blocked:()=>this.guards.dialogOpen,reduced:()=>this.reducedMotion,ready:id=>this.sceneReady?.(id)??true}):null;
  }
  private continuous = false;
  private navigation: {from:number;to:number;start:number;duration:number;id:ScreenNodeId} | null = null;
  private bridge: PageTransition | null = null;
  setContinuous(enabled:boolean) { this.continuous=enabled;this.navigation=null;this.bridge=null;this.cancelMagnetism('idle');this.pendingTarget=null;this.clearIdle(); }
  navigationRunning() { return this.scenes?.busy()??(this.navigation!==null); }
  /** Driven by the existing runtime frame; no additional scroll clock. */
  tickNavigation(now:number) {
    if(this.scenes){this.scenes.tick(now);return;}
    const n=this.navigation,host=this.attached;if(!n||!host)return;
    const u=unit((now-n.start)/n.duration);
    host.scrollTo({top:n.from+(n.to-n.from)*smooth(u),behavior:'auto'});
    this.sync(false);
    if(u>=1){
      this.navigation=null;this.pendingTarget=null;this.mode='idle';this.sync(true);
      if(typeof document!=='undefined' && !document.activeElement?.closest('nav, header'))document.getElementById(`heading-${n.id}`)?.focus({preventScroll:true});
    }
  }
  private layoutAdapter: (() => CanonicalLayout | null) | null = null;
  private prepareLayout: (() => void) | null = null;
  private cssAnchorAlignment = false;
  setCssAnchorAlignment(enabled: boolean) { this.cssAnchorAlignment = enabled; }
  setLayoutAdapter(adapter: (() => CanonicalLayout | null) | null, prepareLayout: (() => void) | null = null) {
    this.layoutAdapter = adapter;
    this.prepareLayout = prepareLayout;
  }
  refreshLayout() { this.sync(true); }
  constructor(private readonly timeSource?: { now: () => number }) {}

  private unlock: UnlockFlags = { competencies: false, brief: false };
  private reducedMotion = false;
  private magnetismVariant: MagnetismVariantId = SELECTED_MAGNETISM_VARIANT;
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
  private lastInputAt = Number.NEGATIVE_INFINITY;
  private gestureStartNodeId: ScreenNodeId | null = null;
  private candidate: MagneticPlan | null = null;
  private guards: MagnetismGuards = { ...EMPTY_GUARDS };
  private supportsScrollEnd = false;
  private onScroll = () => {
    if(this.scenes){this.scenes.nativeScroll();this.sync(false);return;}
    // A browser may deliver the scroll event after the input-idle timer has
    // already fired (notably wheel and touch momentum under a busy GPU). Keep
    // the magnetism timer tied to the last actual scroll pixel, within a
    // bounded window after that user gesture.
    const recentUserScroll = (this.lastInput === "wheel" || this.lastInput === "touch" || this.lastInput === "scrollbar")
      && this.now() - this.lastInputAt <= LATE_USER_SCROLL_GRACE_MS;
    if (recentUserScroll && (this.mode === "idle" || this.mode === "user")) {
      this.mode = "user";
      this.armIdle();
    }
    this.queue();
  };
  private onResize = () => {if(this.scenes){this.viewport={width:this.attached!.innerWidth,height:this.attached!.innerHeight};this.prepareLayout?.();this.scenes.resize();}else this.resize();};
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
    if(this.continuous && event.key.startsWith('Arrow')) return;
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

  getPendingTarget() {
    if(this.scenes)return this.scenes.snapshot().target;
    return this.pendingTarget;
  }

  committedActorNodeId(): ScreenNodeId {
    if(this.scenes)return this.scenes.snapshot().target??this.scenes.displayed;
    if(this.continuous)return this.snapshot.activeNodeId;
    if (this.pendingTarget && (this.mode === "programmatic" || this.mode === "restore" || this.mode === "magnetic")) {
      return this.pendingTarget;
    }
    return this.snapshot.activeNodeId;
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

  getFastGesture() {
    return this.fastGesture;
  }

  getModeSnapshot() {
    return {
      mode: this.mode,
      fastGesture: this.fastGesture,
      pendingTarget: this.pendingTarget,
      rawObservedNodeId: this.snapshot.activeNodeId,
      committedNodeId: this.committedActorNodeId(),
      magneticCandidateId: this.candidate?.nodeId ?? this.pendingTarget,
    };
  }

  magnetismTokens() {
    const variant = MAGNETISM_VARIANTS[this.magnetismVariant];
    return {
      ...MAGNETISM,
      inputIdleMs: variant.inputIdleMs,
      activationRadiusFactor: variant.activationRadiusFactor,
      snapDurationMs: variant.snapDurationMs,
    };
  }

  setMagnetismVariant(id: MagnetismVariantId) {
    this.magnetismVariant = id;
  }

  getMagnetismVariant() {
    return this.magnetismVariant;
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
    if(this.scenes){this.detachScenes=this.scenes.attach(target);this.sync(true);return()=>this.detach();}
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
    this.detachScenes?.();this.detachScenes=null;
    this.navigation=null;this.bridge=null;
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
    if (this.layoutAdapter?.()) {
      this.unlock = unlock;
      this.sync(true);
      return;
    }
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
    return this.layoutAdapter?.() ?? canonicalLayout(this.viewport.height, this.unlock);
  }

  noteUserInput(kind: UserInputKind) {
    if(this.scenes)return;
    if (this.guards.unmounted) return;
    if(this.continuous){this.navigation=null;this.pendingTarget=null;}
    if (this.mode === "idle" || this.mode === "magnetic") {
      this.fastGesture = false;
      this.gestureStartNodeId = this.snapshot.activeNodeId;
    }
    this.lastInput = kind;
    this.lastInputAt = this.now();
    this.cancelMagnetism("user");
    this.mode = "user";
    this.progressRevision += 1;
    this.armIdle();
  }

  evaluateMagnetism() {
    this.onInputIdle();
  }

  scrollToNode(id: ScreenNodeId, behavior?: ScrollBehavior, origin: ScrollOrigin = "programmatic") {
    if (!isNodeUnlocked(id, this.unlock)) return false;
    if(this.scenes)return this.scenes.request(id,origin==='restore'?'restore':'command');
    const layout = this.layout();
    const top = restoreScrollY(layout, id, 0);
    if(this.continuous && origin==='programmatic' && behavior!=='auto' && !this.reducedMotion && this.attached){
      const from=this.attached.scrollY;
      if(Math.abs(top-from)<1)return true;
      this.cancelMagnetism(origin);this.clearIdle();this.pendingTarget=id;this.mode=origin;
      const current=this.snapshot.activeNodeId;
      const a=layout.segments.findIndex(s=>s.id===current),b=layout.segments.findIndex(s=>s.id===id);
      if(this.bridge && (id===this.bridge.from || id===this.bridge.to)){
        // Reversal keeps the currently displayed bridge and its exact phase.
      }else if(Math.abs(a-b)>1){
        const low=top>from?current:id,high=top>from?id:current;
        this.bridge={from:low,to:high,progress:top>from?0:1,start:Math.min(from,top),end:Math.max(from,top),fromStart:layout.byId[low]!.start,toStart:layout.byId[high]!.start,direct:true};
      }else this.bridge=null;
      this.navigation={from,to:top,start:this.now(),duration:TRANSITION.duration,id};
      this.sync(true);return true;
    }
    this.navigation=null;this.bridge=null;
    if (
      this.pendingTarget === id
      && (this.mode === "programmatic" || this.mode === "restore")
      && Math.abs(this.lastY - top) <= MAGNETISM.noopDistancePx
    ) {
      return true;
    }
    if (
      this.snapshot.activeNodeId === id
      && Math.abs(this.lastY - top) <= MAGNETISM.noopDistancePx
      && this.mode !== "magnetic"
      && this.mode !== "user"
    ) {
      return true;
    }
    this.cancelMagnetism(origin);
    this.clearIdle();
    this.lastInputAt = Number.NEGATIVE_INFINITY;
    this.gestureStartNodeId = null;
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
    return true;
  }

  private liveGuards(): MagnetismGuards {
    const next = { ...this.guards };
    if (typeof document !== "undefined") {
      next.dialogOpen = next.dialogOpen || !!document.querySelector('dialog[open]');
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
    this.idleTimer = host.setTimeout(() => this.onInputIdle(), this.magnetismTokens().inputIdleMs);
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
    if(this.continuous){this.mode='idle';this.candidate=null;this.sync(false);return;}
    if (this.layoutAdapter?.()) { this.mode = "idle"; this.candidate = null; this.sync(false); return; }
    if (this.guards.pointerHeld) return;
    // Native scroll and scrollend may arrive before the queued RAF samples
    // scrollY. Plan against the actual final pixel, not the previous frame.
    if (this.attached && Math.abs(this.attached.scrollY - this.lastY) > 0.4) this.sync(false);
    if (magnetismGuardsBlock(this.liveGuards())) {
      this.mode = "idle";
      this.candidate = null;
      return;
    }
    const fullyStopped = Math.abs(this.velocity) < 0.04;
    const tokens = this.magnetismTokens();
    const plan = planMagneticSnap({
      scrollY: this.lastY,
      viewportHeight: this.viewport.height,
      unlock: this.unlock,
      direction: this.direction,
      velocityPxPerMs: this.velocity,
      fullyStopped,
      lastConfidentDirection: this.lastConfidentDirection,
      // Once the gesture has entered a new node, a small overshoot should
      // settle back to that node's anchor instead of being treated as a
      // reverse jump to the node where the gesture began.
      fastGesture: this.fastGesture && this.snapshot.activeNodeId === this.gestureStartNodeId,
      tokens,
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
    const duration = this.magnetismTokens().snapDurationMs;
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
    // A completed snap is no longer a candidate for the next direct route.
    // Keeping it here makes the actor settle machine prefer the old node over
    // the newly observed node after a rapid reverse navigation.
    this.candidate = null;
    this.skipHysteresis = false;
    this.fastGesture = false;
    this.lastInputAt = Number.NEGATIVE_INFINITY;
    this.gestureStartNodeId = null;
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
    this.candidate = null;
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
    this.navigation=null;this.bridge=null;
    this.viewport = { width: this.attached.innerWidth, height: this.attached.innerHeight };
    // Apply the presentation mode before measuring it. Sticky panels share a
    // top coordinate until their reading-flow CSS has been enabled.
    this.prepareLayout?.();
    const nextLayout = this.layout();
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
    if(this.scenes){
      const scene=this.scenes.snapshot(),layout=this.layout(),i=layout.segments.findIndex(s=>s.id===scene.displayed);
      const changed=scene.displayed!==this.snapshot.activeNodeId||scene.target!==this.snapshot.scene?.target||scene.preview!==this.snapshot.scene?.preview||scene.confirmed!==this.snapshot.scene?.confirmed||scene.selecting!==this.snapshot.scene?.selecting||forceDiscrete;
      this.mode=scene.target?'programmatic':'idle';this.lastY=scrollY;
      const next:ScrollProgress={...this.snapshot,scene,transition:scene.transition,scrollY,viewportWidth:this.viewport.width,viewportHeight:this.viewport.height,documentHeight:layout.documentHeight,activeNodeId:scene.displayed,nextNodeId:layout.segments[i+1]?.id??null,previousNodeId:layout.segments[i-1]?.id??null,direction:(scene.transition.sign??1) as 1|-1,edgeProgress:0,revision:++this.progressRevision};
      this.snapshot=next;this.writeCss(next);for(const listener of this.frame)listener(next);if(changed)for(const listener of this.discrete)listener(next);return;
    }
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
    const layout = this.layout();
    const rawNode = layout.segments[rawIndexAt(scrollY, layout)];
    const rawAnchor = rawNode ? restoreScrollY(layout, rawNode.id, 0) : Number.POSITIVE_INFINITY;
    // Native input can stop at the CSS start, two pixels before restoreScrollY.
    // Magnetism deliberately does nothing there. Yield hysteresis across that
    // whole no-op interval so the visible section is also the interactive one.
    const atAnchor = scrollY >= rawAnchor - (this.cssAnchorAlignment ? MAGNETISM.noopDistancePx : 0)
      && scrollY - rawAnchor <= MAGNETISM.noopDistancePx;
    let next = mapScrollToProgress({
      layout,
      scrollY,
      viewportHeight: this.viewport.height,
      viewportWidth: this.viewport.width,
      unlock: this.unlock,
      previousActive: this.snapshot.activeNodeId,
      direction: this.direction,
      ignoreHysteresis: this.skipHysteresis || this.pendingTarget !== null || programmatic || atAnchor,
    });
    if(this.continuous){
      if(this.bridge && (scrollY<this.bridge.start-2||scrollY>this.bridge.end+2))this.bridge=null;
      const transition=this.bridge?{...this.bridge,progress:unit((scrollY-this.bridge.start)/Math.max(1,this.bridge.end-this.bridge.start))}:pageTransition(layout,scrollY);
      const active=displayedNode(transition,this.snapshot.activeNodeId);
      const index=layout.segments.findIndex(s=>s.id===active);
      next={...next,transition,activeNodeId:active,previousNodeId:layout.segments[index-1]?.id??null,nextNodeId:layout.segments[index+1]?.id??null};
      if(this.bridge && !this.navigation && (transition.progress===0||transition.progress===1))this.bridge=null;
    }
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
    if(progress.scene){root.dataset.sceneTarget=progress.scene.target??'';root.dataset.scenePreview=progress.scene.preview??'';root.dataset.sceneSelecting=String(progress.scene.selecting);root.dataset.sceneArrival=String(progress.scene.arrival);root.dataset.sceneReading=String(progress.scene.reading);}
    if(progress.transition){root.dataset.pageProgress=String(progress.transition.progress);root.dataset.pageFrom=progress.transition.from;root.dataset.pageTo=progress.transition.to;}
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
