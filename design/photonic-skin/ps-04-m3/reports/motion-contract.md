# PS-04.M3 motion contract

## Overlay order

Frozen evaluator (including the existing M4 actor pulse) produces `center`, `orientation`, `normal`, `local`.

```
p_base = center + local
fieldScalar = dot((center - origin) / scale, direction)   // center_base, BEFORE idle
p_idle = anchor + idleScale * R_idle * (p_base - anchor)
n_idle = normalize(R_idle * n_base)
p_render = (p_idle + frameTranslate) * frameScale
```

- `anchor` is the frozen actor contract `[0, 0, 0]`, not a per-frame bbox or mean of active IDs.
- Uniform scale is applied to the whole scale (center and local vertex together). Nonuniform scale is not used.
- Rotation, scale, and presentation each run once. Shader: `uIdleEnabled`, `uIdleScale`, `uIdleQuat`, `uIdleAnchor`.
- Bypass: `overlayMode === "m2-reference"` or identity transform sets `uIdleEnabled = 0`, which is a no-op versus M2.
- Color samples `center` before idle, so a frozen color phase keeps albedo on a persistent ID while the actor rotates. Lighting may change.

Inverse overlay returns `p_base` within CPU tolerance. Normals stay unit length.

## Idle presets (after visual check; start values kept)

| Family | Breath | Rotation |
| --- | --- | --- |
| MASTER | ±1.2%, 8 s | 360° turn about +Z, 180 s |
| SINGLE | ±0.5%, 9 s | rock ±3°, 26 s |
| FOCUS / GATHER / DRIVE | ±0.5%, 9 s | rock ±3°, 26 s |
| BRAND_WIDE | ±0.35%, 10 s | rock ±3°, 30 s |

Breath is a sine of `breathPhase`. Rock is a sine of `rotationPhase` about `[0,0,1]`. MASTER turn is `rotationPhase * 2π`. Quaternions follow Three.js `(x,y,z,w)`; `q` and `-q` are equivalent via shortest slerp.

Color wave, breath, and rock/turn periods are independent.

## Profile policy

| Profile | Policy |
| --- | --- |
| desktop / mobile390 | full decorative idle |
| silhouette180 | breath × 0.45, rotation off |
| silhouette96 | decorative idle off |

180/96 are shown as explicit reduced/off profiles, not hidden as an all-profile pass.

## Handoff

On a new geometry request:

1. Capture M4 snapshot (only while `status === "transitioning"` and `progress < 1`), displayed overlay, palette LUT, color phase, and request identity in one `captureJoint()`.
2. Settled clicks skip the 16 384 × 3 live-source evaluate.
3. Residual = displayed overlay at click. Live decorative idle weight goes to 0 during morph so it does not stack on the frozen actor pulse.
4. Residual fades with a C2 window from `t = 0` to Reveal start `0.40`. C0 is guaranteed. C1 is **not**: C2 has zero derivatives at the ends, so a non-zero incoming idle velocity is not C1.
5. After settle, idle eases in from identity over 1 s.

MASTER large yaw is corrected while the silhouette is still spherical (anticipation/release, about 0.39 s of a ~0.98 s QA desktop program). Shortest slerp to identity; no Euler rewind; no snap to identity before morph; no transfer of accumulated yaw onto the object pose.

With overlay off, exact `t = 0` / `t = 1` remain frozen-base exact. With overlay on, the first displayed frame may carry residual idle. That is expected, not a frozen-base failure.

## Double-application guard

The M4 snapshot is evaluator-space **without** the M3 overlay. Overlay uniforms are applied only in the shader (and CPU reference tests). Residual is the displayed overlay at click, then faded; live idle is separately weighted.

## Time

`PhotonicMotionSession` owns time. Lab RAF calls `tick(dt)` once. `useFrame` reads `snapshot()` and does not tick. `dt` is seconds, clamped to 0.1 s for the whole session. Duplicate tick tokens are ignored. Hidden/offscreen skip tick and refresh `clock.previous` so resume has no catch-up. Pause all freezes geometry, palette, idle, and color.
