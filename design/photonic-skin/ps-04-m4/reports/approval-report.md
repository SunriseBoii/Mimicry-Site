# PS-04.M4 approval report

## Outcome

PS-04.M4 is implemented as an isolated full-page composition lab over frozen M1–M3. Production homepage is unchanged. Technical gates for hashes, tests, GPU parity, typecheck, lint, and production build are green. WebM clips were played at 1× in this session.

**PS-04.M4 — CONDITIONAL / HUMAN REVIEW REQUIRED**

Reasons for CONDITIONAL (not BLOCKED): 390×844 is emulated, not a physical device; some R3F p95 samples exceed 16.7 ms on Intel headless (pacing / sparse windows after retarget, not GPU timers). Scroll trap was not observed: vertical wheel inside pinned chapter 05 advanced document `scrollY`.

No commit, push, deploy, or PS-04.M5.

---

## 1. Git / baseline / M4-only delta

HEAD `f9e45229da988ed1e98fb032f18864af22a0315f`. M3 `dba82d1` is an ancestor. Starting tree: committed M1–M3; untracked user topology note preserved. M4 adds `app/visual-lab/photonic-skin-ps04-m4/**`, `tests/photonic-ps04-m4.test.ts`, `design/photonic-skin/ps-04-m4/**`. Frozen hashes match. See `pre-implementation-snapshot.json` and `frozen-verification.md`.

## 2. Topology and SVG overrides

18 nodes, 3 horizontal chapters, 2 non-node states. Owner override: no Mimic on footer; header on all screens including footer. Responsive `100svh`; 16:9 is an approval profile. Copy is provisional.

## 3. Scroll architecture

One document vertical route. Sticky `100svh` tracks + `translate3d` from CSS variables. Canonical layout maps `scrollY` → node + `edgeProgress`. Hysteresis 0.12 vh on adjacent wheel; programmatic navigation ignores hysteresis until the target node. `html { scroll-behavior: smooth }` is overridden to `auto` while the lab is mounted; JS may request smooth for header/graph.

## 4. Dynamic unlock and form

Monotonic unlock. Empty confirm is a text alert. Brief is local. Contact delay 480 ms; success 4200 ms; no network/PII. Graph stays on `03.3` during overlays (probe).

## 5. Header / graph

One header. Orthogonal SVG graph, distance opacities 1 / 0.68 / 0.34 / 0.12 / 0, dashed locked rings, traveler on the active edge.

## 6. One Canvas / mapping

One `PhotonicMotionSession`, one Canvas, one RawShaderMaterial. Resolver table in `mapping-report.md`. Exact or documented fallback; never invents IDs. 127 masks in tests.

## 7. Left/right and footer

Square scissor/viewport after frozen overlay. Camera aspect 1, up `[0,0,1]`. Footer composition exit then `visible=false` / offscreen pause. Reverse restore without remount. Smoke: `actorDraw: false` on `08`.

## 8. Frozen / GPU / tests / performance

Hashes match. GPU 552/46 and 32896+4369 valid on M3 and M4. `npm test` 135/135. Python 4+11+11. tsc/lint pass. Build **39/39** static pages (M3 was 37; + M4 lab + preview). Idle p95 7.1 ms; boundary 20.2 ms; rapid-window 50 ms (sparse). Intel Iris Xe ANGLE; not mixed with RTX history.

## 9. Evidence actually watched

Seven VP8 WebMs played at 1× until `ended`. Stills pack + 7 boards. Dark first paint `#090B0D`. Context restore `restored`. Production `/` screenshot.

## 10. Carry-forward

M3: C0 not C1; MASTER 180 s not watched as a film; Light pin-specks; small Dark 180/96; MASTER Light phase; proxy coverage; Intel pacing. M4: physical 390 device; human composition feel; mapping candidates not aesthetically locked; Next.js dev badge on `next dev` stills; legal consent copy; no CMS/API.

Do not start M5 until a human reviews the lab.
