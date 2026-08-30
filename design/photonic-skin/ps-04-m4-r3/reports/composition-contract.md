# M4.R3 composition (R2 full-canvas preserved)

Viewport remains the full Canvas. Scissor stays disabled. Clip-space affine (`uSiteClipScale`, `uSiteClipOffset`) is unchanged.

R3 adds, after frozen `presented`:

- continuity radius lift when `uContinuityEnabled` and `0 < t < 1` and evaluator is M4
- identity / reduced / endpoints: lift = 1

Site slot and fit interpolation now use transaction `siteProgress` (regroup→approach C2 window) instead of an independent exponential chase.
