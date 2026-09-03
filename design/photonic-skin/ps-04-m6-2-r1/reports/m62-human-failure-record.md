# PS‑04.M6.2 — Human failure record

```text
PS-04.M6.2 — HUMAN FAIL / CORRECTION REQUIRED
correctionTarget = PS-04.M6.2-R1
```

M6.2 remains uncommitted. Baseline stays the M6.1 checkpoint `c29e143580947fdf3f3f4121271a10805d4c5498`. This record is not a HUMAN PASS and does not authorize a checkpoint.

## What failed

The machine packet claimed explicit competency clicks on settled `03.2` were live. Owner review found they were not. Route magnetism still gated in-screen toggles, so Mimic did not follow the M6.1 contract:

```text
03.2 + 0 selected → MASTER
03.2 + 1 selected → exact SINGLE
03.2 + 2–7 selected → exact GATHER(draft selected set)
```

## Coupled defects found with that failure

1. About `02` could remain MASTER after settle because `assertNoForbiddenFallback()` ran on every contract, including canonical BRAND_WIDE.
2. Presentation X/Y waited on semantic morph / `positionProgress`, so Cases → Content and Merch → Team showed a late lateral move after the screen had already settled.
3. Frozen magnetism capture radius (`0.25 vh`, cubic ease-out) was too short; R1 keeps the same controller clock and adds `R1_STRONG_BALANCED`.

## What R1 must prove

- Each competency toggle on settled `03.2` creates a typed `in-screen-action` without a new `magneticSettleRevision`.
- Confirm / DRIVE on `03.3` stay a separate route-settle request.
- About stays exact BRAND_WIDE all-seven, desktop zoom 1.24, mobile cap 1.18.
- Placement interpolates frozen slots from scrollY; it does not create actor/compile/queue work.
- Stronger magnetism is monotonic, skippable, and cancels on fresh input inside the existing tick.
