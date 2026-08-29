# PS-04.M4.R2 visual review

Reviewed real Edge/WebGL stills and 1× WebM playback, not PNG existence.

## Confirmed by eye

- R1 square-mask vs R2: yellow silhouette still settles in the right envelope; R2 GL viewport is the full Canvas (device 1440×900 at DPR 1, not the 518² slot).
- `dpr-2-hero`: MASTER visible in the right third. R1 DPR disappearance is still fixed.
- `right-left-unclipped` / board 02 mid frame: sphere overlaps case cards while moving; circular silhouette is not cut by a vertical slot edge.
- Board 19 `diag-05-1`: yellow SINGLE bbox extends left of the cyan envelope and remains visible. Envelope is a guide, not a scissor.
- Diagnostic HUD: `clip 0.360,0.576` matches `S/W,S/H` for the 518.4 slot on 1440×900.
- `magnet-near-snap`: settled Hero (`scrollY` 2 after a 0.18×vh stop).
- `magnet-far-no-snap`: mixed Hero/About at `scrollY` 378; no snap.
- `magnet-fast-no-back`: Cases (04) after rapid wheels, not a reverse capture to 01.
- `competence-05.1-light`: SINGLE Content on the left, copy on the right.
- `about-light`: BRAND_WIDE cluster on the right, not a corner sliver.
- `footer-no-mimic`: no actor.
- `production-homepage-untouched`: live `/` SiteShell, no M4 Canvas.
- `dialog-suppress`: contact modal over Build; magnetism snapshot `suppressed: true`.
- `context-restore`: 05.4 Games SINGLE still on the left after context loss.
- WebM `full-down-up` t2: particles sit outside the sphere over cards with no square cutoff.
- WebM `right-left-unclipped` t2: MASTER-like sphere on the left of 05.1 without a square frame.
- Six named WebM files played at `playbackRate = 1` until `ended`.

## Human review remaining (not machine FAIL)

- Magnetism strength (160 ms / 0.25 vh / 340 ms) is a lab start, not an aesthetic PASS.
- Envelope overflow on sparse BRAND_WIDE / some SINGLEs is allowed; how far overflow should go is a human call.
- Emulated 390: MASTER still overlaps the second CTA (R1 note).
- Unclipped Canvas makes release/regroup holes and palette-on-source geometry more visible. That is M4.R3, not retuned here.
