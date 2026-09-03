# PS‑04.M6.2‑R2 — Root cause

```text
PS-04.M6.2-R2 root cause
baseline = c29e143580947fdf3f3f4121271a10805d4c5498
working tree = uncommitted M6.2 + M6.2-R1 + this R2 fix
```

## Chain that must fire

```text
pointer/keyboard on DOM competency button
→ BuilderChapter onClick → dispatchProjectBuilderAction({ type: "toggle-competency" })
→ reduceProjectBuilderAction → setDraftCompetencies + canonical draft revision
→ MagnetizedSettleController.requestInScreenAction("03.2")
→ typed { kind: "in-screen-action", hostNodeId: "03.2", interactionRevision }
→ ActorTransitionCoordinator.begin → asset/program ready → buffer bind → visual morph
→ atomic settled endpoint (MASTER / exact SINGLE / exact GATHER)
```

## Path A — QA handle (R1 false PASS)

`window.__PS04M62R1_LAB__.setCompetencies(ids)` only called `setFlow(setDraftCompetencies)`. No `pointerdown`. Settle `scrollPhase` stayed `Settled`, `magnetizedSettledNodeId` stayed `03.2`. The React effect then called `requestInScreenAction(host)` and the coordinator morphed. Capture recorded `in-screen-action` and exact hashes. That is why R1 machine evidence said PASS while a person pressing the same buttons saw no Mimic change.

There is no separate QA-only coordinator callback. Both paths used the same `setFlow` → effect publisher. The split is **before** that publisher.

## Path B — real DOM press (broken)

Window capture on `ScrollCompositionController.attach` hears `pointerdown` for every click, including `[data-qa^="competence-"]`.

R1 `R1MagneticDriver.install` patches `noteUserInput` and forwards it:

```text
MagnetizedSettleLab magneticDriver.install.onUserInput
→ MagnetizedSettleController.noteUserInput("pointer")
→ onScrollActivity()
→ if phase === "Settled": phase = "Traversing"
```

Then `onClick` updates draft. The effect runs `requestInScreenAction`:

```text
magnetized-settle-runtime.ts requestInScreenAction
  if (this.phase !== "Settled") return null;   // FAIL here
```

`interactionRevision` is incremented only after that gate, so it stays unchanged. `magneticSettleRevision` is also unchanged. Draft React state, `aria-pressed`, and HUD selected set update. `contract` / GPU buffer / `visualLifecycle` stay on the previous MASTER (or last committed) endpoint.

When idle later returns `scrollPhase` to `Settled`, the effect does **not** re-run: `flow` already committed. The in-screen request is lost.

Keyboard Space is in the scroll controller key list (`" "`, `"Spacebar"`), so it takes the same Traversing gate. Enter does not, which is why a keyboard-only probe can look flaky.

## What it is not

- Not a stale `hostNodeId` of `03.1`. After settle, `magnetizedSettledNodeId` is `03.2`.
- Not a distinct QA callback. QA used the same `setFlow`.
- Not draft revision missing from the effect deps. `flow` was in the effect array.
- Not an equality/dedup hit on Path B. The Settled gate returned first, before `contract.key === actorEndpointKey`.
- Not a missing M6.1 resolver. Path A already resolved exact SINGLE/GATHER.
- Not R1 magnetism/placement. Those channels are independent and stay locked.

## Fix

1. `requestInScreenAction` allows an anchored host (`magnetizedSettledNodeId === 03.2` and no real scroll displacement) even if a UI pointer marked `Traversing`.
2. DOM, keyboard, and QA share `dispatchProjectBuilderAction`. Domain reduction is pure. The semantic request is published once, outside the React updater, with `interactionRevision` exactly-once.
3. Acceptance clicks the visible `[data-competency-id]` buttons. The QA handle must not be used as R2 proof.
