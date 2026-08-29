# M4.R2 full-canvas clip-space composition

## Old R1 pipeline (removed as a clip)

Square CSS slot → Y-flip to WebGL CSS → `setViewport` **and** `setScissor` to that square. The square was simultaneously composition frame, projection area, and clipping boundary. Persistent scales hit the invisible square during transforms.

## New R2 pipeline

1. Canvas remains `position: fixed; inset: 0`.
2. WebGL viewport = full Canvas CSS size. Scissor test off.
3. Camera aspect stays 1 (frozen square projection).
4. After frozen evaluator, M3 overlay, presentation, and camera projection, an M4-only clip-space affine places the square NDC into the left/right envelope:

```
centerX = L + S * 0.5
centerY = H - T - S * 0.5
clipScale = (S/W, S/H)
clipOffset = (2*centerX/W - 1, 2*centerY/H - 1)

siteClip.xy = clip.xy * uSiteClipScale + clip.w * uSiteClipOffset
```

Uniforms: `uSiteClipScale`, `uSiteClipOffset`, `uSiteCompositionEnabled`.

Identity/parity: enabled = 0, scale (1,1), offset (0,0). Footer: `actorDraw = false`.

## Site fit (unchanged from R1)

master 1.00 · brandWide 1.16 · complex 1.14 · single 1.36 · none 1.00

Settled measured centers still match the left/right third. Envelope overflow during transition is allowed. Hard canvas-edge cutoff of ≥2% silhouette is a FAIL. Slot-edge cutoff is diagnostic, not a settled FAIL unless two envelope edges are flush.

DPR: CSS slot is invariant; Three.js multiplies pixel ratio once. Device viewport is now the full Canvas, not the slot.
