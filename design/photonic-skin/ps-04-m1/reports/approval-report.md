# PS-04.M1 approval report

## Outcome

PS-04.M1 is implemented as an isolated Material Foundation stage. The technical gate is green; aesthetic approval is intentionally left to a human reviewer.

## Integration choice

The frozen actor was already a `RawShaderMaterial` whose vertex stage owns the complete M4 evaluator and presentation transform. Replacing it with `MeshStandardMaterial` or `MeshPhysicalMaterial` through `onBeforeCompile` would require reproducing or approximating the evaluator across Three.js shader chunks and would increase parity and double-transform risk. The selected path preserves the evaluator math and adds only surface-normal, view-position and persistent-seed varyings, followed by a controlled lightweight physically based fragment layer.

The fragment layer implements GGX/Cook-Torrance key and fill lighting, neutral ambient/contact response, a restrained rim, a very weak clearcoat lobe, shader-owned ACES tone mapping and explicit linear-to-sRGB output. It uses no emissive, bloom, environment map, external texture, displacement or post-processing.

## Exact material presets

Light: background `#F5F2EB`; substrate `#E9E5DC`; albedo `#DED9CF`; roughness `0.62`; metalness `0.02`; specular `0.22`; clearcoat `0.005`; clearcoat roughness `0.72`; exposure `0.92`; ambient/key/fill/rim `0.22/0.56/0.18/0.055`.

Dark: background `#090B0D`; substrate `#15181B`; albedo `#282D31`; roughness `0.48`; metalness `0.38`; specular `0.42`; clearcoat `0.015`; clearcoat roughness `0.66`; exposure `1.04`; ambient/key/fill/rim `0.34/1.42/0.82/0.20`.

Studio directions in view space: key `normalize(-0.46, 0.38, 0.80)` and fill `normalize(0.58, -0.16, 0.80)`. No colored lighting is used.

## Stable variation

Variation is generated from a uint avalanche of persistent ID. Its maximum half-ranges are roughness `0.025`, albedo/value `0.018` and specular `0.015`. It is flat per instance, independent of frame/time, and cannot change position, scale, activation or silhouette. Disabling it changes only the material response.

## Renderer and resources

- Transparent, premultiplied, antialiased WebGL2 Canvas.
- `SRGBColorSpace`; renderer `NoToneMapping`; shader owns ACES and linear-to-sRGB; exposure is a material uniform.
- One actor, one draw, `131,072` triangles, one shader program, one geometry, 16 reused data textures, approximately 4 MiB.
- No shadow map, PMREM, HDR asset or environment map.
- Long-lived geometry, material, uniforms and data textures are memoized and disposed on unmount/context lifecycle.

## Frozen parity and route preservation

All four frozen hash/fingerprint values remain exact. The old M4.1R route remains READY with one draw, its locked camera/presentation diagnostics and zero browser console errors. GPU transform-feedback over 552 samples / 46 times passed with maximum deltas: position `1.612881469714722e-6`, orientation `5.193958663940457e-6`, normal `9.805042648303175e-6`, scale `6.100715637114007e-7`, activation `3.053740477154676e-7`. Camera up remains `[0,0,1]`; t=0/t=1 and presentation matrices remain exact.

## Browser lifecycle

At DPR 1.5, the 512 CSS square returns a 768×768 drawing buffer. Context loss/restore returns to the same buffer and resources. A 1440→820→1440 sequence returns the identical square buffer and camera diagnostic. Side-by-side mode creates two independent Canvas instances with identical camera contracts. Program/resource counters remain one program, one geometry and 16 textures for the active actor; there is no per-frame shader or React per-element allocation path.

## Known limitations and next stages

- Chrome/ANGLE may log a non-fatal shader optimization convergence warning; compilation and rendering remain valid.
- The frozen Three.js path logs an existing `THREE.Clock` deprecation warning.
- Fine specular points in Light and the lowest-luminance complex Dark states require human aesthetic sign-off.
- M1 reserves but does not activate theme palette from/to, palette progress or global color phase.
- PS-04.M2 color fields/waves/retargeting, PS-04.M3 idle motion and PS-04.M4 production integration are explicitly untouched.
- No homepage integration, commit, push or deployment was performed.

## Checkpoint

**MACHINE PASS / HUMAN REVIEW REQUIRED**
