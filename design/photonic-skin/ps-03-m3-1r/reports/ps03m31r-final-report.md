# PS-03.M3.1R — Production View Promotion & Event Orientation Freeze

Status: **MACHINE PASS / HUMAN REVIEW REQUIRED**

1. Initial git status

   ```text
   ## master
   ?? app/visual-lab/photonic-skin-m3-1/
   ?? app/visual-lab/photonic-skin-m4/
   ?? design/photonic-skin/ps-03-m3-1/
   ?? design/photonic-skin/ps-03-m4/
   ?? public/photonic-skin/ps-03-m3-1/
   ?? public/photonic-skin/ps-03-m4/
   ?? tests/photonic-m31.test.ts
   ?? tests/photonic-m4-runtime.test.ts
   ```

   Existing M3.1/M4 work was preserved. No tracked or unrelated user files were overwritten.

2. Confirmed M3.1 baseline

   `PS-03.M3.1`, state version `3.1.0`, 154 states, 146 COMPLEX/BRAND_WIDE, fingerprint `21a78652d529eb0b1d34765aad42f0ae8379aa3f7fb9d3ec5af698548464d6e5`.

3. Exact camera role promotion

   - New canonical: `[2.8, -7.8, 4.6]` (previous alternate).
   - New alternate: `[5.6, -6.4, 4.1]` (previous canonical).
   - Side unchanged: `[8.8, 0.0, 1.4]`.
   - Top unchanged: `[0.01, -0.01, 9.4]`.
   - FOV unchanged: `33°`; camera animation remains disabled.

4. Event candidates checked

   - `+12°`: orientation target passes; 5 canonical desktop `figure-right` dust failures.
   - `+15°`: orientation target passes; 2 canonical desktop `figure-right` dust failures.
   - `+18°`: 0 production dust/visibility failures; canonical forward difference `1.7468366°`, alternate difference `23.1859252°`.
   - All candidates were rendered from real endpoint buffers in both production cameras. Selected mobile390 views were also rendered.

5. Selected Event Euler and rationale

   Final Euler is `[0°, 0°, +18°]`. It is the first candidate in the allowed deterministic sweep that clears all candidate screen-space failures. Its canonical difference is only `0.253°` below the brief's approximate 2° boundary, while alternate remains a full 3/4 view.

6. Orientation axes and permitted translation

   Orientation changed by yaw only. Pitch and roll are both `0°`; determinant is `1`; reflection is absent. Two proven residual dust conflicts received the smallest deterministic Event-only rigid translations, applied to all five Event components together and written into real endpoint coordinates/resolved definitions:

   - `complex-focus-content-design-digital-event-merch-focus-content`: magnitude `0.01`, offset `[0.009128455519676209, -0.004083051979541778, 0]`.
   - `complex-focus-digital-event-games-merch-video-focus-digital`: magnitude `0.02`, offset `[-0.010451843738555908, 0.017051656246185303, 0]`.

7. Event-containing states rebuilt

   Exactly 83: 1 SINGLE/Event and 82 multi-state endpoints. All 83 content hashes changed.

8. Non-Event buffers preserved

   Exactly 71 geometry buffers remain byte-identical to M3.1. Semantic state IDs are preserved 154/154.

9. SINGLE/Event hash mapping

   - M3.1: `ca3b14bc0bf5b91c13f6288809783db9948f041dfb300bd9aa12f652c5a14763`
   - M3.1R: `b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933`

10. Representative hash mappings

   - FOCUS/Event lead: `95dd466537bcb1f4b1aba26f3d36b08c2bae0e7f15fecdf866d3c004e30365bc` → `7323936fdca70e265109b724790ed5fd6d9ac5aa1271dbb9a114a58aded97387`
   - GATHER/card 4: `bb07843e5146dff87fb2cb30f7b528d16540b84ce47c4dc28a774a5890da3582` → `1a56bbd370a87e818c0564b4e6adf8ee6b65bafaf1f70416de88f24dd8639f70`
   - DRIVE/card 4: `776b2ee5ec4ce2fb59db88265821489abff48cdd0a577fb74d2f7fa09e9a003e` → `fe42fddd28ff079a3e8caba0f140e27987c425a5d1dc329e698d555594ee27b3`
   - BRAND_WIDE/Gather: `a4fabe54750de4f52169ddfdeb303162bfeb86f357ee6710449b2f5f1da5ebeb` → `8f351e33baa3faf3ae442f09e8715584c740ce7564e3073f1c8bfc86923ac5d7`
   - BRAND_WIDE/Drive: `7e5087bc019ca7da6729512bca8e7249775bcca1b8d6d1ab91391b4924e9e0c7` → `27e2f5bcf2637050ccdaa43ce3e342106ef444532f1cb7d4afa4f56d87f541bc`

11. New M3.1R fingerprint

   `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2`

   Stage `PS-03.M3.1R`, state version `3.1.1`, builder `ps03m31r-presentation-builder-v1`.

12. Full machine QA

   - States: `154/154` passed.
   - State/view/profile rows: `1,232`.
   - Owner rows: `4,528`.
   - Component rows: `10,200`.
   - Machine failures: `0`.
   - Master-core failures: `0` across 146 multi states.
   - Clipping, safe-margin, visibility, footprint, endpoint dust: `0` failures.
   - Rigid-transform invariant failures: `0`; identity IDs, topology, shells, component membership, surface area and volume preserved.
   - Determinism: `154/154` stable state hashes and stable aggregate fingerprint.
   - Python tests: `4/4` passed.
   - TypeScript tests: `39/39` passed.
   - lint: passed; typecheck: passed; production build: passed; render pipeline: passed.
   - Browser: comparison switching, all Event presets, desktop/mobile profiles, 1280/900/390 resize, four cameras and six debug modes passed; clean console errors `0`.

13. Visual QA

   Candidate board plus all 12 comparison boards were inspected with vision. Camera role promotion, Event front/3/4 readability, vertical portal, horizontal stage, attached figures, preserved FOCUS/GATHER/DRIVE, mobile/silhouettes, safe frame, occlusion and dust resolution all passed. No visual blockers remain.

14. Review paths

   - Lab: `http://localhost:3000/visual-lab/photonic-skin-m3-1r`
   - Manifest: `public/photonic-skin/ps-03-m3-1r/manifest.json`
   - State mapping: `public/photonic-skin/ps-03-m3-1r/state-mapping.json`
   - QA summary: `public/photonic-skin/ps-03-m3-1r/qa-summary.json`
   - Candidate board: `design/photonic-skin/ps-03-m3-1r/renders/board-event-orientation-candidates.png`
   - Board manifest: `design/photonic-skin/ps-03-m3-1r/renders/render-manifest.json`
   - Full screen QA: `design/photonic-skin/ps-03-m3-1r/reports/ps03m31r-screen-validation.json`
   - Rigid invariants: `design/photonic-skin/ps-03-m3-1r/reports/ps03m31r-rigid-invariants.json`

15. Limitations

   Blender/headless: **NOT RUN** because Blender remains unavailable and is optional for this rigid presentation patch. The clean browser console has 0 errors; current React Three Fiber emits the known third-party `THREE.Clock` deprecation warning. Human approval is intentionally not recorded by the Lab.

16. Human-review checklist

   1. Did the previous alternate become a successful primary canonical?
   2. Is Event corrected in the new canonical?
   3. Is Event acceptable in the new alternate?
   4. Are the accepted FOCUS/GATHER/DRIVE compositions preserved?
   5. May M3.1R be frozen as the endpoint library for a future M4.1 stage?

17. Scope confirmation

   ```text
   M4.1 was not started.
   M4 transitions were not recompiled.
   PS-04 was not started.
   No commit was created.
   No deploy was performed.
   ```

Only an explicit positive human answer may authorize a future M4.1 stage.
