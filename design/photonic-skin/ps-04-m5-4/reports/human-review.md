# PS‑04.M5.4 — Human review

**Verdict: HUMAN PASS / SELECTED M5 FRAMING PROFILE**

This record does not rewrite the machine framing gates. It documents owner visual acceptance of the maximum checked desktop candidates as the selected M5 framing profile. It is not production approval, not a production swap, and not the start of M5.5.

## Owner decision

```text
status = HUMAN PASS / SELECTED M5 FRAMING PROFILE
selectedProfile = OWNER_SELECTED_124_111_111

aboutRequestedZoom = 1.24
aboutMobileCap = 1.18

merchRequestedZoom = 1.11
merchMobileCap = 1.08

videoRequestedZoom = 1.11
videoMobileCap = 1.08

notProductionApproval = true
promotionTarget = PS-04.M5.5
m55Started = false
```

BALANCED_REVIEW (About 118 / Merch 108 / Video 108) remains evidence and the M5.4 sandbox query fallback. It is not the selected profile.

## Selected Event / Video (unchanged)

```text
selectedCandidate = EVENT_A_R2
hash = 5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b
humanDecision = PASS

selectedCandidate = VIDEO_COMBO_40_R1
hash = 2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873
composition = camera + clapperboard
compositionYaw = −40° around +Z
clapperOpenAngle = 30°
humanDecision = PASS
```

## Status flags

- `notCanonicalYet = true`
- `notProductionApproval = true`
- `productionApproval = false`
- `canonicalSelectionPendingHumanReview = false`
- `promotionTarget = PS-04.M5.5`
- `m55Started = false`

## What this does not approve

- Canonical Event/Video replacement in the 154-state library
- Production `/`
- Production framing on SiteShell
- Closing residual `PS04-M5-R001`
- Starting PS‑04.M5.5 or M5.6

## Review URLs

- `/visual-lab/photonic-skin-ps04-m5/framing-sandbox?screen=about&aboutZoom=124&merchZoom=111&videoZoom=111&viewport=current&diagnostic=final&theme=light&mode=settled`
- `/visual-lab/photonic-skin-ps04-m5/framing-sandbox/preview`

Production `/` remains SiteShell.

## Checkpoint

- Lab: `/visual-lab/photonic-skin-ps04-m5/framing-sandbox`
- Preview: `/visual-lab/photonic-skin-ps04-m5/framing-sandbox/preview`
- Selected profile: `OWNER_SELECTED_124_111_111`
- Branch: `ps04-m5-sandbox`
- Pre-commit HEAD / M5.3.R1 baseline: `af13e9df27be788f8295900d1d7a021bca699998`
