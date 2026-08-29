# PS-04.M3 approval report

## Outcome

PS-04.M3 is implemented as an isolated Surface Motion stage over frozen PS-03 geometry, PS-04.M1 lighting, and PS-04.M2 color. Technical gates are green. Aesthetic sign-off is left to a human reviewer. Owner permission to start M3 after looking at M2 does **not** close M1/M2 visual review and does not approve every new animation.

**PS-04.M3 — MACHINE PASS / HUMAN REVIEW REQUIRED**

No commit, push, deploy, or production homepage integration was performed. PS-04.M4 was not started.

---

## 1. Git status, baseline HEAD, snapshot

HEAD `ded950b8047ca08a3797ac3d872dba3dd56b34e3` on `master`. Starting working tree: HEAD clean; untracked M2 only. Pre-implementation inventory: `reports/pre-implementation-snapshot.json`.

M3-only additions: `app/visual-lab/photonic-skin-ps04-m3/**`, `tests/photonic-ps04-m3.test.ts`, `design/photonic-skin/ps-04-m3/**`. M1/M2/M4.1R routes, reports, and sources were not rewritten.

## 2. APIs and overlay boundary

- Frozen evaluator ends at `center` / `orientation` / `normal` / `local`. Actor pulse already exists in M4 (`actorTrack.window` anticipation). M3 does not add a second pulse.
- Live-source retarget: `createRetargetSnapshot` in evaluator space, without presentation and without the M3 overlay. Settled clicks skip the 16 384×3 evaluate.
- M2 `PhotonicPaletteController` is unchanged. Geometry-linked progress is `PhotonicPaletteDriver` (`mode: free | geometry-linked | immediate`).
- One session ticks; `useFrame` only reads `snapshot()`.

## 3. Overlay formula

```
p_base = center + local
fieldScalar = dot((center - origin) / 3.6, direction)
p_idle = [0,0,0] + scale * R * (p_base - [0,0,0])
n_idle = normalize(R * n_base)
p_render = (p_idle + frameTranslate) * frameScale
```

Bypass: `uIdleEnabled = 0`. Enabled overlay is an intentional visual difference.

## 4. Presets and 180/96

Kept start values after viewing: MASTER ±1.2%/8 s, turn 180 s; SINGLE/FOCUS/GATHER/DRIVE ±0.5%/9 s, rock ±3°/26 s; BRAND_WIDE ±0.35%/10 s, rock ±3°/30 s. **180:** breath ×0.45, rotation off. **96:** decorative idle off.

## 5. Handoff

Residual = displayed overlay at click; decorative idle weight 0 during morph; C2 fade to identity by Reveal start 0.40; idle ease-in 1 s after settle. C0 yes. C1 no. MASTER yaw uses shortest slerp during the spherical window (~0.39 s of ~0.98 s). Not silently disabled.

## 6. Phases and color

Semantic Release = anticipation+release. Palette C2 from regroup[0]=0.24 to reveal[0]=0.40. Geometry-linked mode does not run the 0.8 s timer. Same mask skips fade. 127 settled masks; transient = visible source ∪ target; excluded tokens 0 at Reveal.

## 7. Interrupt

`beginRequest` revision; latest wins; stale commits ignored. 20-hit stress in tests. Live snapshot only while transitioning.

## 8. Time / reduced / visibility / context

Session `tick(dt)` clamp 0.1 s, duplicate-token guard, hidden/offscreen skip tick and refresh `previous` (no catch-up). Pause all vs color-wave pause vs idle off. Reduced: identity idle, geometry endpoint, palette ≤160 ms. Side-by-side: one session, both canvases pause on context loss.

## 9. Parity

Frozen hashes match. M3 shader minus idle overlay equals M2 vertex. GPU TF 552/46 valid. Field 32896+4369 valid. Overlay-on evaluator delta 0.

## 10. What remains for M4 / M5

Site-wide production connection, real navigation, homepage composition, freeze of all PS-04. Not this stage.

## Pending human review

Calmness of idle; MASTER large-yaw correction; 180/96 policy; carry-forward M1/M2 limits; 1× playback of the WebM clips.
