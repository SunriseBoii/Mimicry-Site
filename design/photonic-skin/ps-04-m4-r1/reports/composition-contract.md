# M4.R1 site fit

Applied as `instancedMesh.scale`, one uniform, interpolated in the existing clock. Frozen presentation matrices are untouched. Identity/parity mode forces scale 1.

| Profile | Scale | Why |
| --- | --- | --- |
| master | 1.00 | MASTER already fills the NDC square as a dense sphere (~25vw silhouette) |
| brandWide | 1.16 | Sparse brand-wide silhouette; measured About bbox ~29vw max dim after lift |
| complex | 1.14 | FOCUS/GATHER/DRIVE complexes share the same NDC target but less visual mass |
| single | 1.36 | Merch/video are the smallest frozen projections; merch reaches ~19.7vw without canvas clipping |
| none | 1.00 | Footer / identity |

Not 18 per-screen magic numbers. Values were set after DPR fix and silhouette measurement, not by randomly enlarging scale to hide the coordinate bug.
