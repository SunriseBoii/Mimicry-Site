# PS-04.M4.R1 visual review

Reviewed real Edge/WebGL stills, not PNG existence.

## Confirmed by eye

- Legacy `dpr-2-hero`: Mimic absent, right half empty
- Fixed `dpr-1-hero` and `dpr-2-hero`: MASTER sphere fully in the right slot, same CSS placement
- `dpr-2-hero-mask`: yellow silhouette inside green CSS slot; label `1440×900 · dpr 2.00 · db 2880×1800 · fit 1.00`
- `about-light`: BRAND_WIDE particle cluster visible on the right, not a corner sliver
- `cases-master`: MASTER sphere on the right, no right-edge fragment
- `competence-05.7-light`: merch SINGLE on the left, copy on the right
- `footer-no-mimic`: no Mimic
- `diag-01`: silhouette bbox inside actor viewport; graph lane marked

## Remaining visual notes (not machine FAIL)

- 390 hero: MASTER can overlap the second CTA
- About/Gather silhouettes are flatter than MASTER; visual weight is a human call
- SINGLE Event/Design occupy almost the whole left slot

WebM files were played at playbackRate 1 until `ended` in this session (see `video-playback.json`).
