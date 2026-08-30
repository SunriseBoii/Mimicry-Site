# Unified actor transition transaction

Owner: `ActorTransitionCoordinator` in `transition-coordinator.ts`.

Session tick remains `PhotonicMotionSession.tick(dt)`. The coordinator never ticks the session. Lab rAF: `noteSessionTick(token)` → at most one `tick` → `syncFromSession` → apply linked palette progress.

## Progress windows (frozen phase edges, not new easing for its own sake)

- Site: C2 from regroup[0]=0.24 to approach[0]=0.62
- Palette (global fallback): C2 from reveal[0]=0.40 to approach[0]=0.62
- Preferred color: per-persistent `vPaletteOwnership`
- Compile gap: `sessionStatus === "transitioning"` and session `g ≥ 1` and not playing → keep `g=0`, `p=0` (unless same mask)

## Interrupt

Latest-request-wins. Source geometry/slot/fit/mask taken from `displayedPlacement()`. Stale revision cannot settle.
