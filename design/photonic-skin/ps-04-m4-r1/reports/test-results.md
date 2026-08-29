# PS-04.M4.R1 machine gates

- Focused M4 tests: 17/17
- `npm test`: 142/142
- `npx tsc --noEmit`: pass
- `npm run lint`: pass
- Python `tests/photonic_m31r_python_test.py`: 4 OK
- Python `ps-03-m4/tests/test_core.py`: 11 OK
- Python `ps-03-m4-1/tests/test_core.py`: 11 OK
- GPU vertex + field parity (M3, M4 identity, M4 ordinary): all valid
- Lab smoke: 1 canvas, 1 draw, 131072 tri, footer reverse keeps session
- Performance idle: 1 canvas, 1 draw, 131072 triangles, 1 program, p95 6.9 ms (rAF, not GPU timer)
- Context restore: `restored`
- Visibility gates: 18/18 pass after settled mask capture
- DPR CSS drift: left 0.04 px, size 0.04 px (limit 2 px)
- Production `/` does not import M4
