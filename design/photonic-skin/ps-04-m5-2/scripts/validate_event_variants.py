"""Machine validation for PS-04.M5.2 Event variant endpoints."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
STAGE_DIR = SCRIPT_DIR.parent
PHOTONIC_DIR = STAGE_DIR.parent
REPO_DIR = PHOTONIC_DIR.parents[1]
M3_SCRIPTS = PHOTONIC_DIR / "ps-03-m3" / "scripts"
M31R_SCRIPTS = PHOTONIC_DIR / "ps-03-m3-1r" / "scripts"
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"

for path in (M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
from m31r_core import rotation_z  # noqa: E402

IDENTITY = 16384
PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)
FROZEN_EVENT = "b14a3b2f8571e3e7d39be074aecbdeb6dd4ca51097c6433db25b622c3394a933"
PARTS = ("stage", "figure-centre", "figure-left", "figure-right")
C_BUDGET = {"stage": (0.40, 0.46), "figure-centre": (0.18, 0.22), "figure-left": (0.16, 0.20), "figure-right": (0.16, 0.20)}


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def load(name: str) -> np.ndarray:
    return np.fromfile(STAGE_DIR / "variants" / name / "single-event.state.bin", dtype=m3.STATE_DTYPE)


def rotate(records: np.ndarray, yaw: float) -> np.ndarray:
    result = records.copy()
    matrix = rotation_z(yaw)
    positions = result["position"].astype(np.float64) @ matrix.T
    result["position"] = positions.astype(np.float32)
    return result


def check(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def main() -> int:
    failures: list[str] = []
    baseline = load("baseline")
    frozen = np.fromfile(PUBLIC_M31R / "states" / "single-event.state.bin", dtype=m3.STATE_DTYPE)
    check(sha256_bytes(baseline.tobytes()) == FROZEN_EVENT, "baseline hash mismatch", failures)
    check(np.array_equal(baseline.tobytes(), frozen.tobytes()), "baseline bytes != frozen SINGLE Event", failures)
    check(len(baseline) == IDENTITY, "baseline N", failures)

    variant_a = load("a")
    expected = rotate(baseline, 180.0)
    position_error = float(np.max(np.abs(expected["position"].astype(np.float64) - variant_a["position"].astype(np.float64))))
    inverse = rotate(variant_a, -180.0)
    inverse_error = float(np.max(np.abs(inverse["position"].astype(np.float64) - baseline["position"].astype(np.float64))))
    sample = baseline["position"][:512].astype(np.float64)
    rotated = variant_a["position"][:512].astype(np.float64)
    dist_a = np.linalg.norm(sample[:, None, :] - sample[None, :, :], axis=2)
    dist_b = np.linalg.norm(rotated[:, None, :] - rotated[None, :, :], axis=2)
    pairwise = float(np.max(np.abs(dist_a - dist_b)))
    check(position_error < 1e-5, f"A closed-form error {position_error}", failures)
    check(inverse_error < 1e-5, f"A inverse error {inverse_error}", failures)
    check(pairwise < 1e-5, f"A pairwise error {pairwise}", failures)
    check(np.array_equal(variant_a["lodPriority"], baseline["lodPriority"]), "A IDs changed", failures)
    check(np.array_equal(variant_a["component"], baseline["component"]), "A membership changed", failures)

    reports = {}
    for name in ("baseline", "a", "b", "c"):
        records = load(name)
        manifest = json.loads((STAGE_DIR / "variants" / name / "manifest.json").read_text(encoding="utf-8"))
        check(len(records) == IDENTITY, f"{name} N", failures)
        check(bool(np.isfinite(records["position"]).all()), f"{name} NaN", failures)
        check(bool(np.array_equal(records["lodPriority"], np.arange(IDENTITY, dtype=np.uint16))), f"{name} prefix IDs", failures)
        check(len(np.unique(records["lodPriority"])) == IDENTITY, f"{name} duplicate IDs", failures)
        check(manifest["contentHash"] == sha256_bytes(records.tobytes()), f"{name} hash drift", failures)
        presence = manifest["lodPrefixPresence"]
        for prefix in PREFIXES:
            missing = [part for part, count in presence[str(prefix)].items() if int(count) <= 0]
            check(not missing, f"{name} LOD {prefix} missing {missing}", failures)
        public = REPO_DIR / "public" / "photonic-skin" / "ps-04-m5-2" / "variants" / name / "single-event.state.bin"
        check(sha256_bytes(public.read_bytes()) == manifest["contentHash"], f"{name} public copy drift", failures)
        reports[name] = {
            "hash": manifest["contentHash"],
            "active": manifest["activeCount"],
            "parts": manifest["activePartCounts"],
        }

    sidecar = json.loads((STAGE_DIR / "variants" / "c" / "event-part.json").read_text(encoding="utf-8"))
    check(sidecar["eventPartNames"] == list(PARTS), "C sidecar names", failures)
    part_bytes = (STAGE_DIR / "variants" / "c" / "event-part.u8.bin").read_bytes()
    check(len(part_bytes) == IDENTITY, "C sidecar length", failures)
    counts = [part_bytes.count(bytes([value])) for value in range(4)]
    check(all(count > 0 for count in counts), "C sidecar missing a part", failures)
    c_counts = reports["c"]["parts"]
    total = sum(c_counts.values())
    fractions = {part: c_counts[part] / total for part in PARTS}
    budget_notes = {}
    for part, (low, high) in C_BUDGET.items():
        value = fractions[part]
        budget_notes[part] = {"fraction": value, "target": [low, high], "inRange": low <= value <= high}
        if not (low <= value <= high):
            budget_notes[part]["note"] = "outside preferred C budget; still one substance with all parts at every LOD"

    payload = {
        "stage": "PS-04.M5.2",
        "pass": not failures,
        "failures": failures,
        "rigidA": {"positionError": position_error, "inverseError": inverse_error, "pairwiseError": pairwise},
        "variants": reports,
        "cFractions": fractions,
        "cBudget": budget_notes,
        "canonicalEventUntouched": sha256_bytes((PUBLIC_M31R / "states" / "single-event.state.bin").read_bytes()) == FROZEN_EVENT,
    }
    dest = STAGE_DIR / "reports" / "authoring-validation.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pass": payload["pass"], "failures": failures, "cFractions": fractions}, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
