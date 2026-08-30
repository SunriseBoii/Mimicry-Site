# PS-04.M4.R6.R1 texture inventory

Source: `reports/texture-inventory.json` (fresh Light DPR 1, Hero MASTER, after `actorFramebufferReady`).

Pool: **48** textures, budget 48, created 48, disposed 0. Active bank 0 generation 1: 16/16 packed, 16/16 uploaded, 16/16 acknowledged, `gpuReady true`. Forward and pending banks allocated, not packed.

Material: UUID `899e7f78-6159-45aa-a9b8-def8a3713ebb`, program count **1**, `allSamplerUuidsMatchActiveBank === true`.

All 16 slots: RGBA Float, `textureVersion` 3, generation 1, `uploadRequestedRevision === uploadAcknowledgementRevision === 3`, `nanCount` 0, `infCount` 0.

| Slot | Uniform | W×H | CPU bytes | checksum | min | max |
| --- | --- | --- | --- | --- | --- | --- |
| source | uSource | 128×128 | 262144 | 934f53c5 | −0.9996 | 1.1504 |
| target | uTarget | 128×128 | 262144 | 934f53c5 | −0.9996 | 1.1504 |
| sourceNormal | uSourceNormal | 128×128 | 262144 | ce315b29 | finite | finite |
| targetNormal | uTargetNormal | 128×128 | 262144 | ce315b29 | finite | finite |
| sourceQuat | uSourceQuat | 128×128 | 262144 | 76c11504 | finite | finite |
| targetQuat | uTargetQuat | 128×128 | 262144 | 76c11504 | finite | finite |
| sourceMeta | uSourceMeta | 128×128 | 262144 | 76efddc5 | finite | finite |
| targetMeta | uTargetMeta | 128×128 | 262144 | 76efddc5 | finite | finite |
| residual | uResidual | 128×128 | 262144 | 76efddc5 | finite | finite |
| lanes | uLanes | 128×128 | 262144 | 76efddc5 | finite | finite |
| velocity | uVelocity | 128×128 | 262144 | 76efddc5 | finite | finite |
| activation | uActivation | 128×128 | 262144 | b6fb5dc5 | −0.080 | 0.720 |
| sourceTracks | uSourceTracks | 256×4 | 16384 | 76efddc5 | finite | finite |
| targetTracks | uTargetTracks | 256×4 | 16384 | 76efddc5 | finite | finite |
| routes | uTrackRoutes | 256×4 | 16384 | 76efddc5 | finite | finite |
| windows | uTrackWindows | 256×4 | 16384 | 76efddc5 | finite | finite |

Identity MASTER: source and target position checksums match. Activation is **not** all zeros (`max 0.72`, `activationHits` 16384 on live-bank probe). Renderer `info.memory.textures` after boot is ~17 (only the active bank uploaded, plus Canvas helpers). After one staging bank it rises toward ~33–49. **JS pool stays 48.** That is not the rejected R5 climb `16 → 464`.
