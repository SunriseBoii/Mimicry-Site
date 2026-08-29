# PS-04.M4.R2 machine gates

- Focused M4 tests: 20/20 (17 R1 + 3 R2)
- `npm test`: 145/145
- `npx tsc --noEmit`: pass
- `npm run lint`: pass
- Python `tests/photonic_m31r_python_test.py`: 4 OK
- Python `ps-03-m4/tests/test_core.py` (module): 11 OK
- Python `ps-03-m4-1/tests/test_core.py` (module): 11 OK
- GPU vertex + field parity (M3, M4 identity, M4 ordinary): all valid, 552/46 and 32896+4369
- Lab smoke: 1 canvas, 1 draw, 131072 tri, sessionId `ps04-m4-r2`, footer reverse keeps session
- Performance idle: 1 canvas, 1 draw, 131072 triangles, 1 program, p95 6.9 ms (rAF, not GPU timer)
- Context restore: `restored`
- Visibility gates: 18/18 pass on settled mask capture
- DPR CSS slot drift: left 0.039 px, size 0.045 px (limit 2 px)
- Production build: 39 pages, `/` unchanged
- Production `/` does not import M4
- Videos watched at 1× until `ended`: 6 named WebM (required five plus footer)

## Focused R2 coverage

Magnetism: near snap, far no-snap, fast no reverse, wheel/touch cancel, same-target no-op, one-edge limit, locked/unlocked `03.2`, temporary overlays, header/graph/restore no second snap, dialog/input suppress, reduced immediate, `05.4→05.5` document `scrollY`, repeated wheel stays in user mode, revision latest-wins, unmount clears timers/rAF.

Composition: full Canvas viewport, scissor ≠ slot, clip scale/offset left+right, CSS slot invariant at DPR 1/1.25/1.5/2, top-left→bottom-left, identity bypass, footer `actorDraw` false, overflow-beyond-envelope still inside Canvas.
