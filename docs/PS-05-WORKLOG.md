# PS-05 — implementation / 24 September 2026

Base: `master` / `c339450363eb06f4363e33d2d4f639f32c5a28ff`; clean working tree before work. Owner's PS-05 instruction accepts PS-04; historical R2 review stops do not block this task. No publishing, external submissions or push.

## M0 / audit

- Next 16.2.6 App Router, React 19.2.6, Three 0.185.1, R3F 9.7; TypeScript 5.9, Node 24.17, tsx/node:test. No animation package installed. Existing scroll controller owns progress; CSS + cancellable Web Animations are sufficient, without a second navigation engine.
- Production: `app/page.tsx` → `_photonic-skin/ProductionPhotonicSiteClient.tsx` → `PhotonicSiteRuntime.tsx` → `MagnetizedSettleLab.tsx` (final-r2, preview).
- State: runtime owns active node, scroll controller, session, flow, theme; `project-builder-semantics/builder-flow.ts` owns draft/confirmed; builder resolver and IDs own MASTER/SINGLE/GATHER/DRIVE. Graph consumes same progress ref.
- Existing horizontal chapter containers already transform. PS-05 must not double that translation. Responsive natural flow uses measured positions through the existing controller.
- Frozen: `public/photonic-skin/**`, geometry, shader, materials, camera, resolver and motion compiler. Composition viewport is an external placement adapter. Existing lab routes remain available.
- Relevant contracts: `docs/mimicry-homepage-topology-checkpoint-2026-08-29.md`, `docs/PS-04-M6-1-MIMIC-SEMANTICS-PROJECT-BUILDER.md`, `design/photonic-skin/ps-04-final-r2/reports/implementation-report.md`.
- MCP graph queried first; stale index omits current production runtime. Files read directly after insufficient graph results.
- Baseline: typecheck PASS; 429 tests PASS; lint/build logs in run evidence (completion tracked below). Screenshots via actual Edge/Playwright, never a mock HTML reproduction.
- Existing screens contain technical fixture copy and invented example case titles; no publishable case/media, team, client, partner, presentation, confirmed direct contact, privacy text or form transport found. Historical contact is simulated success. These are data/integration dependencies, not reasons to stop components.
- Defect found: re-confirmation overwrites edited stale brief. Existing desktop 100svh layout can clip longer content. Mobile repeats fixed desktop panels.

## Sequence and progress

M0 audit/capture → M1 UI foundation → M2 catalog/generator/edit state → M3 navigation/builder → M4 coordinated motion → M5 cases/content templates → M6 transport/resilience → M7 matrix/review.

M0–M7 complete. Integrated production implementation, automatic checks, visual/motion review and owner review package are ready. External content/transport dependencies remain documented.

## R01–R22 coverage plan

| IDs | Implementation / verification |
|---|---|
| R01–03 | Scoped composition, editorial typography, controller-aligned whole-block motion; screenshots/video |
| R04 | Excluded: no SplitText / line masks |
| R05–08 | Equal Hero entries, radio tasks, checkbox competencies, draft/confirmed summary; real UI flow |
| R09 | Excluded: no recommendations/AI helper |
| R10 | Large case template; real case content awaits owner |
| R11 | Central typed catalog + deterministic generator; exhaustive 508 combinations and manual copy review |
| R12 | Same detail view, A default / B shared cover; local review fixture + history/focus tests |
| R13–16 | Direct competency links, graph labels, restrained interactions and selection accent |
| R17 | Preserved editable brief, native modal, validated transport adapter + explicit test transport |
| R18 | Typed trust data + ready templates + honest empty states |
| R19 | Clipboard fallback and conditional presentation |
| R20–22 | Natural mobile/short-screen flow, motion controls, keyboard, fast DOM independent of 3D |

Technical references: [WAI modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Web Animations](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate), [Anime.js](https://animejs.com/documentation/) reviewed; no additional motion dependency needed.

## Implemented / M1–M6

- Integrated `app/_ps05` into `/` through the production runtime. Existing lab routes retained. Large typography, equal Hero entries, task radios, explicit checkbox selection, work theses, draft/confirmed summary, mirrored competence composition and full-width footer.
- Central typed catalog, 35 possible-work examples, task goals and prerequisite-based combination phrases. All 508 non-empty task/set combinations are deterministic and bounded. Edited requests survive re-confirmation; update/keep/undo are explicit.
- Persistent Canvas and existing controller retained. Scoped viewport placement only; measured reading flow on mobile, short screens or overflowing copy. Canonical desktop horizontal chapters remain when content fits.
- Whole-copy WAAPI exit/enter (140/260 ms, delayed entrance), cancellation on reversal/resize/unmount. No SplitText, line masks, AI recommendations or second scroll engine.
- Native dialog with focus restoration/trap/Escape/scroll lock. Case A/B share one detail view and URL/history. B shared cover 420 ms open / 260 ms close; reduced motion uses A.
- Form validates name and phone/Telegram, preserves input, deduplicates in-flight submission, supports failure/retry/receipt. Public transport is unavailable. Explicit local test transport never sends a network POST.
- Typed content + honest empty states, local labeled case/trust fixtures, responsive images and broken-image fallback, conditional presentation/legal/contact links. No invented agency work or clients published.

## M7 findings and corrections

- Preserved manual brief instead of implicit overwrite (baseline defect); tested keep/replace/undo and empty draft after confirmation.
- Long copy clipped by fixed viewport: measured natural reading layout; no arbitrary font shrink or mandatory text clamp.
- Phone consisting solely of punctuation accepted: validate digit count as well as formatting.
- Field helper/error included in accessible name: explicit field name, errors via description.
- Footer unreachable by 0.14 px in measured flow: clamp final anchor to actual browser maximum; regression test added.
- Deep-linked active case could stay inert after reload due to competing DOM state owners: accessibility now follows the controller's discrete subscription. Repeated URL/history test added.
- Early matrix frames caught unsettled GPU transitions: final captures explicitly wait for matching target/progress=1. These interim captures are not endpoint evidence.
- Mobile test harness used stale accessible menu label after opening; corrected selector. This was a test error, not a product change.
- Copy review: replaced repeated conjunction between compound competency phrases with “, а также”; 10 representative generated texts recorded.
- React Compiler lint rejected a mutable query-derived manual memo; test transport now has explicit session lifetime via state initializer.

M7 verification paths: `scripts/ps05-browser-qa.mjs`, `scripts/ps05-extra-qa.mjs`, `scripts/ps05-performance.mjs`; evidence below `design/photonic-skin/ps-05/2026-09-24/`. Baseline and PS04 evidence remain untouched. No HUMAN PASS claimed.

## Final verification

- Full suite 436/436; final focused PS05 tests 7/7; production build/typecheck PASS; lint 0 errors / 16 baseline warnings.
- Main browser matrix PASS: 98 captures/checks, 0 runtime errors. 18 screens × 2 desktop themes, responsive 320/360/390/844/1280, error/retry/success, persistent Canvas, history, reduced motion and unavailable 3D.
- Supplemental keyboard, all tasks, confirmed SINGLE, exact clipboard (Windows CRLF normalized), form axe and real mobile GATHER PASS. Supplemental dark-theme audit identified transient contrast during the card background transition; removed the background tween. Final theme audits are clean (`final-checks/manifest.json`).
- Final B: hide source/target while one cover clone moves, restore on finish/cancel; quick Escape and resize clean up and restore focus. Frame-by-frame review confirmed single cover. 320 px min-height initially transferred an unwanted aspect-ratio width; explicit width:100% corrected it, dialog horizontal overflow asserted absent.
- Removed the legacy scene-loading diamonds only in scoped PS05 CSS because their viewport-centred placement crossed mobile text. DOM remains independent of scene readiness.
- Viewed desktop/light/dark and responsive contact sheets, representative originals, form, content templates, broken image, and time-labelled motion frames. No HUMAN PASS or user testing claimed.
- Laboratory performance: PS05 DOM observed 451 ms, LCP 84 ms, CLS 0, RAF interval p95 48.5 ms; PS04 reference 547 / 1460 / 0 / 42.4 ms. Single local run, not a 60 fps guarantee; shader/cache/order effects apply.
- Baseline and frozen PS04 evidence untouched. Temporary duplicate captures removed; diagnostic manifests retained in `diagnostics/`. Server remains on http://127.0.0.1:3001/.
