# CPU pair and GPU texture inventory

## 16 textures per pair

All RGBA Float (`THREE.RGBAFormat` + `FloatType`), `NoColorSpace`, `unpackAlignment = 1`.

| Slot | Sampler | Dimensions | Bytes | Frequency |
| --- | --- | --- | --- | --- |
| source | `uSource` | 128×128 | 262 144 | per-endpoint |
| target | `uTarget` | 128×128 | 262 144 | per-endpoint |
| sourceNormal | `uSourceNormal` | 128×128 | 262 144 | per-endpoint |
| targetNormal | `uTargetNormal` | 128×128 | 262 144 | per-endpoint |
| sourceQuat | `uSourceQuat` | 128×128 | 262 144 | per-endpoint |
| targetQuat | `uTargetQuat` | 128×128 | 262 144 | per-endpoint |
| sourceMeta | `uSourceMeta` | 128×128 | 262 144 | per-endpoint |
| targetMeta | `uTargetMeta` | 128×128 | 262 144 | per-endpoint |
| residual | `uResidual` | 128×128 | 262 144 | per-pair (packs all program buffers) |
| lanes | `uLanes` | 128×128 | 262 144 | per-pair |
| velocity | `uVelocity` | 128×128 | 262 144 | per-pair |
| activation | `uActivation` | 128×128 | 262 144 | per-pair |
| sourceTracks | `uSourceTracks` | 256×4 | 16 384 | per-pair |
| targetTracks | `uTargetTracks` | 256×4 | 16 384 | per-pair |
| routes | `uTrackRoutes` | 256×4 | 16 384 | per-pair |
| windows | `uTrackWindows` | 256×4 | 16 384 | per-pair |

`PAIR_CPU_BYTES = 3 211 264` (one compiled pair, one copy of each buffer).

## GPU pool

- 3 banks: **active**, **forward**, **pending**
- `GPU_TEXTURE_BUDGET = 48`
- Texture **objects** created once per bank; data rewritten in place
- Dimensions / format / type frozen after first use
- One `initTexture` per scheduler slice; yield on wheel/touch/pointer/keydown
- No second Canvas, no second material, no second WebGL program

## CPU LRU

- Desktop budget: `96 MiB` (`100 663 296`)
- Mobile budget: `32 MiB` (`33 554 432`)
- Pins: active displayed pair, forward neighbour, reverse neighbour, pending intent
- Eviction: unpinned typed arrays first; never dispose a bank still bound to the current revision
- Lookahead uses topology registry; does not compile all 35 pairs blindly

## 16 → 464 explanation

**Confirmed same-context retention**, not a harness-only artifact:

1. Missing `Texture.dispose()` of the previous 16-set
2. Duplicate allocation (`useFrame` bind + `useMemo` after commit)
3. Intentional CPU cache of compiled typed arrays (secondary; bounded in R6)

R6 two full down/up cycles: `renderer.info.memory.textures = 48` and pool `48` at every sample. Heap ~107 MB → 85 MB → 92 MB (plateau, not 102 → 702).
