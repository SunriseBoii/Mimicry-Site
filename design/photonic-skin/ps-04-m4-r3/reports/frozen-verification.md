# Frozen hash verification

| Check | Expected | Result |
| --- | --- | --- |
| M4.1 aggregate | `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361` | match |
| M4.1 manifest | `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441` | match |
| M4.1R patch | `228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0` | match |
| M3.1R fingerprint | `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2` | match |
| M1 source | `4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb` | match |
| M2 source | `f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d` | match |
| M3 source | `184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1` | match |
| M4.R1 source | `f86d717b652d66ae30d72fd480a386e9fbf5d8b9efa297325ae8c6f9b10b5d12` | previous checkpoint |
| M4.R3 source | `9c8f6a4b65c99bee6bfc711af01f6b57d0486e9bd742e708bd7f50580f156284` | this checkpoint |

M1–M3 source files, evaluator math through `presented`, geometry, correspondence, transition programs, palette driver implementation, and presentation artifacts were not edited.

R3 adds an M4-only radius overlay *after* `presented` and a read-only `vPaletteOwnership` varying. Identity mode forces both to 0. GPU vertex probe of `vEvalChannels` remains valid.

Production `/` still uses `SiteShell` and does not import the M4 lab.
`design/photonic-skin/ps-04-m4/`, `ps-04-m4-r1/`, and `ps-04-m4-r2/` were not rewritten.
`docs/mimicry-homepage-topology-checkpoint-2026-08-29.md` is unchanged.
