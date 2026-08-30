# Frozen hash verification — PS-04.M4.R6

Designated baselines were checked **before** R6 edits and again in `tests/photonic-ps04-m4-r6.test.ts`. Hashes were **not** rewritten to match local files.

| Artifact | Expected | Status |
| --- | --- | --- |
| M4.1 aggregate | `a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361` | match |
| M4.1 manifest | `d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441` | match |
| M4.1R patch | `228ddce450536d94d625d73f99ceff133371ccfe515a6f21cc3377fa3fda3ca0` | match |
| M3.1R endpoints | `0c778f0f1bdddb85f2021c0b9764084e8893b1231ac6f19253fe11ec7f8bfdf2` | match |
| M1 source | `4cb80b507605bf439e9de5210e5f022159c716ee286fa81b98f0e943cf5b75eb` | match |
| M2 source | `f04bc262cdc80e6061d2ad7fdb6501f60aa0a31105a55f876a8eaa26f0266c0d` | match |
| M3 source | `184744da085dc31e08c954640456133308585b7b8ef107de43ab2f8d7a8e6ec1` | match |
| M4.R1 source | `f86d717b652d66ae30d72fd480a386e9fbf5d8b9efa297325ae8c6f9b10b5d12` | match |
| M4.R2 source | `726bc3bbf3f6c8d754b82204d4d02a20cd519fb836e1c5521c0ccb5d224e4333` | match |
| M4.R3 source | `9c8f6a4b65c99bee6bfc711af01f6b57d0486e9bd742e708bd7f50580f156284` | match |
| M4.R4 source | `37e99fe9e6b9a10a6bc735351948fd678facdb50bee6c0ae980dd65bee752069` | match |
| M4.R5 source | `853cd3b8373b3116330acf2643fefdc9d7b84424c3bf1515d9df5c52c15421ef` | match (R5 designated; R6 source hash is a new checkpoint, not a replacement) |

R6 source aggregate (this checkpoint, not a designated frozen baseline): `4a24385bcdda85496155e699edfbeab9bc1818488c1c246884ab3088d3acdb4f`.

R6 `hash-checkpoint.mjs` writes `reports/checkpoint-hashes.json` after evidence is frozen. R5 directory was not rewritten.
