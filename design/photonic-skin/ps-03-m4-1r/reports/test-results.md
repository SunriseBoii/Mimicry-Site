# PS-03.M4.1R test results

Status: **MACHINE PASS / HUMAN REVIEW REQUIRED**

- Presentation parity harness: 2,464/2,464 production cases PASS; 64/64 Event/Design four-camera diagnostics PASS; 1,232 standalone adapter cases covered.
- TypeScript: 86/86 tests PASS across the complete repository suite, including 33 M4.1R presentation tests and existing M3.1R/M4/M4.1 regressions.
- Python: M3.1R contract 4/4 PASS; M4.1 core 11/11 PASS.
- Existing M4.1 aggregate QA executed read-only (`write=False`) with its SciPy dependency installed only in a temporary runtime directory: 78/78 checks true, `machine-valid`.
- Existing legacy `test_ps03m41.py` wrapper was also attempted. It stops on a pre-existing stale assertion for `transitionRecordLayout`, a key absent from the frozen hash-verified M3.1R manifest. M3.1R was not modified to satisfy that obsolete wrapper; the underlying aggregate QA and core suite pass.
- Browser screen-space QA: desktop/mobile/180/96, DPR 1/1.5/2, wide→narrow→wide, comparison modes, retarget/reduced/static PASS.
- WebGL approval-program transform-feedback parity: valid; 552 samples / 46 time samples; max position error 1.613e-6; max orientation error 5.194e-6; max normal error 9.805e-6.
- WebGL context loss/restore: restored.
- Typecheck: PASS (`tsc --noEmit`).
- Lint: PASS (`eslint .`).
- Production build: PASS (`next build --webpack`), including static route `/visual-lab/photonic-skin-m4-1r`.
- Visual QA: 47 browser screenshots; 18/18 approval boards inspected with vision.

No compiler/program rebuild, commit, deploy, PS-04 work or production integration was performed.
