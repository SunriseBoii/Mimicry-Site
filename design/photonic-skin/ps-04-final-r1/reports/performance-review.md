# PS‑04 final R1 — performance and scene recovery QA

Captured 2026‑09‑16 against local `/` at `http://localhost:3000`. The full route run used headless Chromium 151 with ANGLE **SwiftShader software rendering**. It is a stress diagnostic, not a hardware performance acceptance run. The route duration fix (`0.65 s` desktop / `0.55 s` mobile) landed after the full run; short rapid traces below verify the updated build.

## Route stress run (before duration fix)

| Measurement | 1440×900, DPR 2 | 390×844, DPR 3 |
| --- | ---: | ---: |
| Route requests | 11 | 11 |
| Settled within 8 s | 9 | 10 |
| First transition frame p95, from intent (instrumented proxy) | 2127 ms | 1973 ms |
| First WebGL change p95, from intent (instrumented proxy) | 384 ms | 381 ms |
| rAF frame interval p95 (135 / 128 samples) | 533 ms | 483 ms |
| Long tasks, maximum duration | 155, 5202 ms | 156, 6194 ms |
| Adaptive scene DPR, initial → after repeated transitions | 1.5 → 0.75 | 1.75 → 1.0 |
| JS heap, initial → after transitions and GC | 104.5 → 112.4 MB | 66.5 → 84.2 MB |
| Transition cache after run / budget | 49.0 / 100.7 MB | 32.2 / 33.6 MB |
| Canvas count after run | 1 | 1 |
| Page exceptions | 0 | 0 |

All completed samples ended with semantic and bound geometry endpoints matching. Two desktop requests (05.1, 01) and one mobile request (01) exceeded the 8 s wait for the combined committed-node/settled condition. The latency fields come from the runtime timeline, not from a direct comparison of rendered pixels. Timeout rows can carry prior transition telemetry. The rAF and long-task data are dominated by SwiftShader and cannot establish the 16.7/33.3 ms device targets or a hardware regression. Initial and final heap readings have different collection points, so their difference cannot establish a leak. The transition cache stayed within its configured byte budgets; texture accounting reached 48/48 budget slots.

## Rapid retarget after the duration fix

One warm Event → 03.1 → 05.1 sequence was captured on each viewport. The final transaction duration is **0.65 s desktop / 0.55 s mobile**, as intended. The 05.1 contract and bound GPU target became `single-content`, and both runs eventually settled there. The scene still showed the previous `master-neutral` settled endpoint at the +1 s sample; it was correct at +5 s. `firstVisibleTransitionMs` for the 05.1 request was 1495 ms desktop / 1149 ms mobile; first WebGL change was 328 / 216 ms. These are software-rendered wall-clock observations and fail the desired 150 ms onset limit in this environment. A hardware run remains necessary.

The `resource()` diagnostic returned `state=absent`, `gpuReady=false` while `programBind()` and `geometrySnapshot()` reported a committed bound program and settled target. The snapshots therefore disagree; use the latter plus actual frames when reviewing endpoint correctness. The rapid trace did not reproduce a persistent (>5 s) wrong GPU endpoint.

## Resize, DPR and context recovery

The same Canvas element remained mounted through desktop resize to 1280×720, mobile resize to 430×844, and manual DPR change. Its CSS/drawing-buffer dimensions changed and `actorFramebufferReady` remained true. Normal production context used `preserveDrawingBuffer=false`.

The desktop context-loss probe reported `restored` at the two-second sample. Mobile was still `lost` at the two-second sample in the full stress run, but focused repeats restored after a longer wait (one repeat still showed `lost` at two samples, then `restored` at the next; another was already `restored` at the first sample). During a mobile `lost` sample, the runtime still reported `actorFramebufferReady=true` and the neutral poster was absent; this deserves a hardware visual check for a blank interval. No permanent loss was observed in these probes.

## Acceptance status

Full-matrix scene continuity, hardware frame-budget p95, and ≤150 ms first-visible-pixel p95 **remain open**. Record these on the actual desktop and mobile target devices with the final build, including pixel capture, normal/rapid routes, repeated transitions, context loss and resize. The headless data is useful for locating delayed bindings and verifying that adaptive DPR and Canvas persistence operate; it is not a device PASS.

## Production hardware follow-up (Intel Iris Xe)

After the dynamic builder-neighbor prewarm was added, the owner-side production IAB probe using real 03.2 buttons reported `data-first-visible-ms` of **33.7 ms** for Event, **26.3 ms** for Event → Event+Video, and **25.7 ms** for a rapid 03.1 → 03.2 → Event. The previously observed 215–246 ms builder selection latency did not recur in these three samples. Warm frame p95 was reported at 14–16 ms; cold start/compile briefly reached 20–50 ms. These are instrumented onset values from one desktop Intel Iris Xe environment, not a statistical p95 over the full navigation matrix or a direct pixel-diff measurement. Hardware mobile, repeated samples, and context restore on target devices remain to be checked.

The final production context-loss probe in headless Chromium recorded framebuffer and resource readiness **false** and the scene poster **visible** at `webglcontextlost`, the next frame while the context remained lost, and `webglcontextrestored` on both desktop and mobile. Both viewports then reported `restored`, regained a fresh actor framebuffer, hid the poster, and raised no page exception. The `isContextLost()` render guard prevents the earlier false resource-ready pulse. This verifies the software-rendered recovery path; a visual check on target hardware is still needed. Raw trace: [context restore QA](context-restore-final-qa.json).

Raw data: [full route run](performance-qa.json), [desktop rapid trace](rapid-gpu-final-desktop.json), [mobile rapid trace](rapid-gpu-final-mobile.json), [mobile context probe](context-mobile-qa.json), [detailed endpoint time series](stuck-gpu-repro.json). Reproduction scripts are in `../scripts/`.
