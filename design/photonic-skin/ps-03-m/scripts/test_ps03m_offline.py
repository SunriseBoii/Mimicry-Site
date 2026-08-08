"""PS-03.M offline solver test suite: validates exported artefacts.

Fast checks against the shipped manifest / binary / QA report (no rebuild).
Run:  python test_ps03m_offline.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[3]
PUBLIC_DIR = ROOT / "public" / "photonic-skin" / "ps03m"
EXPORT_DIR = SCRIPT_DIR.parent / "exports"

N = 8192
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        FAILURES.append(name)


def main() -> int:
    manifest = json.loads((PUBLIC_DIR / "ps03m-manifest.json").read_text("utf8"))
    blob = (PUBLIC_DIR / "ps03m-states.bin").read_bytes()
    qa = json.loads((EXPORT_DIR / "ps03m-qa-report.json").read_text("utf8"))

    print("scale identity")
    check("scale_count == 8192", manifest["scale_count"] == N)
    check("unique_scale_ids == 8192", qa["unique_scale_ids"] == N)
    check("missing_ids == 0", qa["missing_ids"] == 0)
    check("duplicate_ids == 0", qa["duplicate_ids"] == 0)

    print("state budgets")
    for name, state in manifest["states"].items():
        check(
            f"{name}: visible + reserve == 8192",
            state["visible"] + state["reserve"] == N,
            f"{state['visible']} + {state['reserve']}",
        )
    for seg in manifest["segments"]:
        ok = all(
            m["visible"] + m["transition"] + m["reserve"] == N for m in seg["meta"]
        )
        check(f"{seg['name']}: visible+transition+reserve == 8192 at all keys", ok)

    print("components")
    check("sphere_components == 1", manifest["states"]["sphere"]["components"] == 1)
    check("book_components == 1", manifest["states"]["book"]["components"] == 1)
    check("game_state_components == 2", manifest["states"]["game"]["components"] == 2)
    split = manifest["states"]["game"]["component_split"]
    check(
        "gamepad + queen ids == 8192",
        split["gamepad"] + split["queen"] == N,
        f"{split['gamepad']} + {split['queen']}",
    )
    check("split moment exists", qa["split_moment_t"] is not None)
    check("merge moment exists", qa["merge_moment_t"] is not None)
    bg = next(s for s in manifest["segments"] if s["name"] == "book-game")
    comps = [m["components"] for m in bg["meta"]]
    check("book-game starts connected", comps[0] == 1)
    check("book-game ends with 2 components", comps[-1] == 2)
    check("single controlled split", "".join(map(str, comps)).count("12") == 1, str(comps))
    gs = next(s for s in manifest["segments"] if s["name"] == "game-sphere")
    comps = [m["components"] for m in gs["meta"]]
    check("game-sphere starts split", comps[0] == 2)
    check("game-sphere ends merged", comps[-1] == 1)
    check("single controlled merge", "".join(map(str, comps)).count("21") == 1, str(comps))

    print("volume")
    for name, state in manifest["states"].items():
        check(f"{name} volume error <= 1%", state["volume_error"] <= 0.01)
    check(
        "transition volume error <= 1%",
        qa["max_transition_volume_error"] <= 0.01,
        f"max {qa['max_transition_volume_error']:.2e}",
    )

    print("target meshes")
    for name, rep in qa["target_validation"].items():
        check(f"{name} watertight", rep["watertight"])
        check(f"{name} no loose vertices", rep["loose_vertices"] == 0)
        check(f"{name} no degenerate faces", rep["degenerate_faces"] == 0)
        check(f"{name} positive volume", rep["positive_volume"])
        check(f"{name} finite", rep["finite"])

    print("binary layout")
    expected_rows = manifest["rows_total"] * manifest["row_bytes"]
    expected = expected_rows + 3 * N * 4 + N + N * 4
    check(
        "bin size matches layout",
        manifest["bin_size"] == expected == len(blob),
        f"{len(blob)} bytes",
    )
    digest = hashlib.sha256(blob).hexdigest()
    check("sha256 matches manifest", digest == manifest["bin_sha256"])
    check(
        "sha256 matches QA deterministic hash",
        digest == qa["deterministic_output_hash"],
    )

    print("finite exported values")
    lo = np.array(manifest["quant_bounds"]["lo"])
    hi = np.array(manifest["quant_bounds"]["hi"])
    check("quant bounds finite", bool(np.isfinite(lo).all() and np.isfinite(hi).all()))
    rot = np.frombuffer(blob, np.float32, N, manifest["rotation_offset"])
    check("rotations finite", bool(np.isfinite(rot).all()))
    # Every row decodes without NaN by construction (uint16/uint8), spot-check
    # one row's octahedral normals are non-degenerate.
    base = manifest["row_index"]["state:game"] * manifest["row_bytes"]
    oct_q = np.frombuffer(blob, np.uint8, N * 2, base + N * 6).reshape(N, 2)
    xy = oct_q.astype(np.float64) / 255.0 * 2 - 1
    z = 1 - np.abs(xy[:, 0]) - np.abs(xy[:, 1])
    check("game normals non-degenerate", bool((np.abs(xy).sum(axis=1) + np.abs(z) > 1e-6).all()))

    print("neighbour graph / stability")
    for seg_qa in qa["segment_qa"]:
        cross = [
            k["cross_component_bonds_after_split"]
            for k in seg_qa["keys"]
            if k["cross_component_bonds_after_split"] is not None
        ]
        check(
            f"{seg_qa['name']}: no cross-component bonds after split",
            all(c == 0 for c in cross),
        )
        flips = max(k["normal_flips"] for k in seg_qa["keys"])
        check(f"{seg_qa['name']}: normal flips < 1% of ids", flips < N * 0.01, str(flips))
        mins = [
            k["min_pair_distance_over_l"]
            for k in seg_qa["keys"]
            if k["min_pair_distance_over_l"] is not None
        ]
        check(
            f"{seg_qa['name']}: collision floor >= 0.25 l",
            min(mins) >= 0.25,
            f"min {min(mins)}",
        )

    print()
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} checks: {FAILURES}")
        return 1
    print("all offline solver checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
