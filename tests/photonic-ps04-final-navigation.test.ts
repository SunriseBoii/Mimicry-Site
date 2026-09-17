import assert from "node:assert/strict";
import test from "node:test";
import {
  MAGNETISM,
  ScrollCompositionController,
  canonicalLayout,
  planMagneticSnap,
  restoreScrollY,
  type ScrollHost,
} from "../app/visual-lab/photonic-skin-ps04-m5/scroll-controller";

class FakeHost implements ScrollHost {
  scrollY = 0;
  innerWidth = 1440;
  innerHeight = 900;
  now = 0;
  private nextId = 1;
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly rafs = new Map<number, FrameRequestCallback>();
  private readonly timeouts = new Map<number, { callback: () => void; at: number }>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const set = this.listeners.get(type) ?? new Set<EventListener>();
    set.add(listener as EventListener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener as EventListener);
  }

  requestAnimationFrame(callback: FrameRequestCallback) {
    const id = this.nextId++;
    this.rafs.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id: number) { this.rafs.delete(id); }

  setTimeout(handler: TimerHandler, timeout = 0) {
    const id = this.nextId++;
    this.timeouts.set(id, { callback: handler as () => void, at: this.now + timeout });
    return id;
  }

  clearTimeout(id?: number) { if (id) this.timeouts.delete(id); }

  scrollTo(options: ScrollToOptions) {
    this.scrollY = options.top ?? 0;
    this.emit("scroll");
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  advance(ms: number) {
    this.now += ms;
    for (const [id, timeout] of [...this.timeouts]) {
      if (timeout.at <= this.now) {
        this.timeouts.delete(id);
        timeout.callback();
      }
    }
    const rafs = [...this.rafs];
    this.rafs.clear();
    for (const [, callback] of rafs) callback(this.now);
  }
}

test("PS-04 final clears a snap candidate when a direct destination interrupts it", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });

  host.scrollY = 150;
  host.emit("scroll");
  host.advance(16);
  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "magnetic");
  assert.equal(controller.getMagnetism().candidateId, "01");

  controller.scrollToNode("05.3", "auto");
  assert.equal(controller.getProgress().activeNodeId, "05.3");
  assert.equal(controller.getMagnetism().candidateId, null);
  controller.detach();
});

test("PS-04 final clears a snap candidate after the snap completes", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });
  host.scrollY = restoreScrollY(controller.layout(), "05.4", 0) - 120;
  host.emit("scroll");
  host.advance(16);
  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "magnetic");
  assert.equal(controller.getMagnetism().candidateId, "05.4");

  host.advance(MAGNETISM.snapDurationMs);
  assert.equal(controller.getMode(), "idle");
  assert.equal(controller.getMagnetism().candidateId, null);
  controller.detach();
});

test("PS-04 final wheel falls back to the current direction when a stale fast direction excludes the nearby anchor", () => {
  const unlock = { competencies: true, brief: true };
  const layout = canonicalLayout(900, unlock);
  const scrollY = restoreScrollY(layout, "05.4", 0) - 150;
  const stale = planMagneticSnap({
    scrollY, viewportHeight: 900, unlock, direction: 1,
    velocityPxPerMs: 0, fullyStopped: true,
    lastConfidentDirection: -1, fastGesture: true,
  });
  assert.equal(stale?.nodeId, "05.4");
  const stillMovingBackward = planMagneticSnap({
    scrollY, viewportHeight: 900, unlock, direction: -1,
    velocityPxPerMs: 0, fullyStopped: true,
    lastConfidentDirection: -1, fastGesture: true,
  });
  assert.equal(stillMovingBackward, null);
});

test("PS-04 final touch landing exactly on a new anchor overrides previous-node hysteresis", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });
  controller.scrollToNode("05.3", "auto");
  const anchor = restoreScrollY(controller.layout(), "05.4", 0);

  host.scrollY = anchor - 1;
  host.emit("scroll");
  host.advance(16);
  assert.equal(controller.getProgress().activeNodeId, "05.3");
  host.scrollY = anchor;
  host.emit("scroll");
  host.advance(16);
  assert.equal(controller.getProgress().activeNodeId, "05.4");
  controller.detach();
});

test("PS-04 final rearms magnetism when native wheel scroll arrives after the first idle timer", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });
  controller.scrollToNode("05.3", "auto");

  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "idle");
  host.scrollY = restoreScrollY(controller.layout(), "05.4", 0) - 150;
  host.emit("scroll");
  assert.equal(controller.getMode(), "user");
  host.advance(16);
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "magnetic");
  assert.equal(controller.getMagnetism().candidateId, "05.4");
  host.advance(MAGNETISM.snapDurationMs);
  assert.equal(controller.getProgress().activeNodeId, "05.4");
  controller.detach();
});

test("PS-04 final does not rearm a stale user gesture after the bounded grace window", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.noteUserInput("wheel");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "idle");
  host.advance(3100);
  host.scrollY = 150;
  host.emit("scroll");
  assert.equal(controller.getMode(), "idle");
  controller.detach();
});

test("PS-04 final plans from native scrollY even when scrollend beats its RAF sample", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });
  host.advance(64);
  controller.scrollToNode("05.3", "auto");
  controller.noteUserInput("wheel");
  host.scrollY = restoreScrollY(controller.layout(), "05.4", 0) - 150;
  host.emit("scroll");
  // Browser scrollend can run before the pending requestAnimationFrame callback.
  controller.evaluateMagnetism();
  assert.equal(controller.getMode(), "magnetic");
  assert.equal(controller.getMagnetism().candidateId, "05.4");
  controller.detach();
});

test("PS-04 final touch overshoot settles back to the newly entered node", () => {
  const host = new FakeHost();
  const controller = new ScrollCompositionController({ now: () => host.now });
  controller.attach(host);
  controller.setUnlock({ competencies: true, brief: true });
  controller.scrollToNode("05.3", "auto");
  controller.noteUserInput("touch");
  const gamesAnchor = restoreScrollY(controller.layout(), "05.4", 0);
  host.scrollY = gamesAnchor + 172;
  host.emit("scroll");
  host.advance(16);
  assert.equal(controller.getProgress().activeNodeId, "05.4");
  host.advance(MAGNETISM.inputIdleMs);
  assert.equal(controller.getMode(), "magnetic");
  assert.equal(controller.getMagnetism().candidateId, "05.4");
  host.advance(MAGNETISM.snapDurationMs);
  assert.equal(host.scrollY, gamesAnchor);
  assert.equal(controller.getProgress().activeNodeId, "05.4");
  controller.detach();
});
