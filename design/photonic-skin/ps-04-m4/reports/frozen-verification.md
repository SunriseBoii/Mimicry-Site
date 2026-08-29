# PS-04.M4 frozen verification

Checked before and after M4 implementation. Old routes and sources were not edited.

| Control | Expected | Result |
| --- | --- | --- |
| M4.1 aggregate | `a07014e6…698361` | match |
| M4.1 manifest | `d0e9aa2f…d7bf441` | match |
| M4.1R patch | `228ddce4…fda3ca0` | match |
| M3.1R endpoints | `0c778f0f…8bfdf2` | match |
| M1 source | `4cb80b50…cf5b75eb` | match |
| M2 source | `f04bc262…0266c0d` | match |
| M2 manifest file | `14a612a5…c3ea9f8` | match |
| M3 source | `184744da…a8e6ec1` | match |
| M3 manifest file | `1c80aeb9…736f6fac` | match |

Git HEAD `f9e4522`. M2/M3 are committed; not untracked vs `ded950b`. Working tree M4-only plus user `docs/mimicry-homepage-topology-checkpoint-2026-08-29.md`.

GPU path: M4 shader bodies = M3. Vertex TF 552/46 valid. Field 32896+4369 valid. Unselected 0.
