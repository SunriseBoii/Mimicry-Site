"""Machine geometry gates for PS-04.M5.3.R1 clapperboard hinge."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from hinge_common import (  # noqa: E402
    COMPONENT_BAR,
    COMPONENT_BOARD,
    COMPONENT_RAIL,
    COMBO_IDS,
    FROZEN_VIDEO,
    IDENTITY_SIZE,
    LOD_PREFIXES,
    M53_DIR,
    OPEN_ANGLE_DEG,
    ORIGINAL_HASHES,
    OWNER_SPEC_HASH,
    PUBLIC_M53,
    PUBLIC_R1,
    REPO_DIR,
    STAGE_DIR,
    active_mask,
    connectivity_3d,
    load_records,
    lod_presence,
    owner_spec_proof,
    sha256_file,
    write_json,
)

M31R_SCRIPTS = STAGE_DIR.parent / "ps-03-m3-1r" / "scripts"
M3_SCRIPTS = STAGE_DIR.parent / "ps-03-m3" / "scripts"
for path in (M3_SCRIPTS, M31R_SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

import state_builder as m3  # noqa: E402
from m31r_core import projected_splats, read_json, render_projection  # noqa: E402

R1_VARIANTS = ("combo-20-r1", "combo-30-r1", "combo-40-r1")
SOURCES = {"combo-20-r1": "combo-20", "combo-30-r1": "combo-30", "combo-40-r1": "combo-40"}
PUBLIC_M31R = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r"


def silhouette_metrics(rgb: np.ndarray) -> dict:
    occupied = rgb.max(axis=2) > 0
    pixels = int(occupied.sum())
    labeled, count = ndimage.label(occupied)
    sizes = np.bincount(labeled.ravel()) if count else np.array([0])
    if len(sizes):
        sizes[0] = 0
    main = int(sizes.max()) if len(sizes) else 0
    closed = ndimage.binary_closing(occupied, iterations=1)
    closed_labeled, closed_count = ndimage.label(closed)
    return {
        "occupied": pixels,
        "rawComponents": int(count),
        "mainShare": float(main / max(pixels, 1)),
        "closedComponents": int(closed_count),
        "morphologicalClosingUsedForPass": False,
        "connected": bool(count <= 1 or (count == 2 and main >= 0.98 * max(pixels, 1))),
        "detachedBarIsland": bool(count >= 2 and main < 0.92 * max(pixels, 1)),
    }


def force_visible(entry: dict, keep: set[int] | None = None) -> dict:
    clone = json.loads(json.dumps(entry))
    profiles = ["desktop", "mobile390", "silhouette180", "silhouette96"]
    for item in clone["componentMap"]:
        item["visibleProfiles"] = list(profiles) if keep is None or item["componentIndex"] in keep else []
    return clone


def isolate(records: np.ndarray, indices: set[int]) -> np.ndarray:
    clone = records.copy()
    keep = np.isin(clone["component"], list(indices)) & (clone["status"] == m3.STATUS_ACTIVE)
    clone["status"][~keep] = m3.STATUS_RESERVE
    return clone


def prefix_records(records: np.ndarray, prefix: int) -> np.ndarray:
    clone = records.copy()
    clone["status"][prefix:] = m3.STATUS_RESERVE
    return clone


def variant_entry(base: dict, name: str, keep: set[int] | None = None) -> dict:
    sidecar = json.loads((STAGE_DIR / "variants" / name / "component-map.json").read_text(encoding="utf-8"))
    clone = json.loads(json.dumps(base))
    clone["componentMap"] = sidecar["componentMap"]
    return force_visible(clone, keep)


def main() -> int:
    failures: list[str] = []
    spec = owner_spec_proof()
    if spec["hash"] != OWNER_SPEC_HASH:
        failures.append("owner spec hash")
    pivot = json.loads((STAGE_DIR / "reports" / "pivot-proof.json").read_text(encoding="utf-8"))
    selective = json.loads((STAGE_DIR / "reports" / "selective-edit-proof.json").read_text(encoding="utf-8"))
    hashes = json.loads((STAGE_DIR / "authoring" / "export-log.json").read_text(encoding="utf-8"))["hashes"]

    for key, expected in ORIGINAL_HASHES.items():
        design = M53_DIR / "variants" / key / "single-video.state.bin"
        public = PUBLIC_M53 / key / "single-video.state.bin"
        if sha256_file(design) != expected:
            failures.append(f"original {key} design hash changed")
        if sha256_file(public) != expected:
            failures.append(f"original {key} public hash changed")
    if sha256_file(REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1r" / "states" / "single-video.state.bin") != FROZEN_VIDEO:
        failures.append("frozen Video changed")
    if sha256_file(REPO_DIR / "design" / "photonic-skin" / "ps-04-m5-2-r2" / "variants" / "a-r2" / "single-event.state.bin") != "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b":
        failures.append("EVENT_A_R2 changed")

    manifest = read_json(PUBLIC_M31R / "manifest.json")
    entry = next(item for item in manifest["states"] if item["stateId"] == "single-video")
    report = {"stage": "PS-04.M5.3.R1", "ownerSpec": spec, "variants": {}, "failures": []}

    for name in R1_VARIANTS:
        records = load_records(STAGE_DIR / "variants" / name / "single-video.state.bin")
        public_hash = sha256_file(PUBLIC_R1 / name / "single-video.state.bin")
        design_hash = sha256_file(STAGE_DIR / "variants" / name / "single-video.state.bin")
        if public_hash != design_hash:
            failures.append(f"{name} public/design mismatch")
        if design_hash != hashes[name]:
            failures.append(f"{name} hash drift")
        source = SOURCES[name]
        if selective["variants"][name]["sourceHash"] != ORIGINAL_HASHES[source]:
            failures.append(f"{name} not derived from original {source}")
        if not selective["variants"][name]["nonClapperByteIdentity"]:
            failures.append(f"{name} non-clapper identity")
        kin = pivot["variants"][name]
        if abs(kin["openAngleAbs"] - OPEN_ANGLE_DEG) > 1.0:
            failures.append(f"{name} open angle")
        if kin["pivotError"] > 1e-4:
            failures.append(f"{name} pivotError {kin['pivotError']}")
        if not kin["barTipAboveBarRoot"]:
            failures.append(f"{name} bar tip does not rise")
        if abs(kin["tipRise"] - kin["expectedTipRise"]) / max(kin["expectedTipRise"], 1e-9) > 0.08:
            failures.append(f"{name} tipRise mismatch")

        bar = records["position"][active_mask(records, COMPONENT_BAR)].astype(np.float64)
        rail = records["position"][active_mask(records, COMPONENT_RAIL)].astype(np.float64)
        board = records["position"][active_mask(records, COMPONENT_BOARD)].astype(np.float64)
        hinge_world = np.asarray(kin["hingePoint"], dtype=np.float64)
        root_world = np.asarray(kin["barRoot"], dtype=np.float64)
        tip_world = np.asarray(kin["barTip"], dtype=np.float64)
        hinge_pts = rail[np.linalg.norm(rail - hinge_world, axis=1) <= 0.28]
        if len(hinge_pts) < 8:
            hinge_pts = rail[np.argsort(np.linalg.norm(rail - hinge_world, axis=1))[:24]]
        root_pts = bar[np.linalg.norm(bar - root_world, axis=1) <= 0.32]
        if len(root_pts) < 8:
            root_pts = bar[np.argsort(np.linalg.norm(bar - root_world, axis=1))[:24]]
        hinge_nn = float(np.median(cKDTree(hinge_pts).query(hinge_pts, k=2, workers=1)[0][:, 1]))
        root_gap = float(cKDTree(hinge_pts).query(root_pts, k=1, workers=1)[0].min())
        contact_pass = root_gap <= 1.25 * hinge_nn
        if not contact_pass:
            failures.append(f"{name} bar root does not meet hinge ({root_gap} > {1.25 * hinge_nn})")
        rail_board = float(cKDTree(board).query(rail, k=1, workers=1)[0].min())
        if rail_board > 0.12:
            failures.append(f"{name} rail not contacting board")

        clapper = np.concatenate([board, rail, bar], axis=0)
        conn = connectivity_3d(clapper)
        if not conn["pass"]:
            failures.append(f"{name} clapper connectivity {conn}")
        if conn["remoteIsland"]:
            failures.append(f"{name} remote island")
        bar_conn = connectivity_3d(bar)
        if bar_conn["remoteIsland"] and conn["components"] > 1:
            failures.append(f"{name} moving bar is a detached island")

        presence = lod_presence(records)
        hinge_lod = {}
        for prefix in LOD_PREFIXES:
            sliced = prefix_records(records, prefix)
            live = sliced["status"] == m3.STATUS_ACTIVE
            board_n = int(np.count_nonzero(live & (sliced["component"] == COMPONENT_BOARD)))
            rail_n = int(np.count_nonzero(live & (sliced["component"] == COMPONENT_RAIL)))
            bar_n = int(np.count_nonzero(live & (sliced["component"] == COMPONENT_BAR)))
            rail_pts = sliced["position"][live & (sliced["component"] == COMPONENT_RAIL)].astype(np.float64)
            bar_pts = sliced["position"][live & (sliced["component"] == COMPONENT_BAR)].astype(np.float64)
            hinge_n = int(np.count_nonzero(np.linalg.norm(rail_pts - hinge_world, axis=1) <= 0.32)) if len(rail_pts) else 0
            hinge_lod[str(prefix)] = {"board": board_n, "rail": rail_n, "hinge": hinge_n, "bar": bar_n}
            if board_n <= 0 or rail_n <= 0 or bar_n <= 0 or hinge_n <= 0:
                failures.append(f"{name} missing part at LOD {prefix}: {hinge_lod[str(prefix)]}")
            if prefix == 512 and len(bar_pts) and len(rail_pts):
                near = float(cKDTree(rail_pts).query(bar_pts, k=1, workers=1)[0].min())
                if near > 0.22:
                    failures.append(f"{name} LOD 512 bar not touching hinge/rail")
                if float(np.max(bar_pts[:, 2])) <= float(np.min(bar_pts[:, 2])) + 0.02:
                    failures.append(f"{name} LOD 512 bar not raised")

        wedge = []
        direction = tip_world - root_world
        length = float(np.linalg.norm(direction))
        direction = direction / max(length, 1e-9)
        for frac in (0.05, 0.25, 0.5, 0.75, 0.95):
            sample = root_world + direction * (frac * length)
            nearby = bar[np.linalg.norm(bar - sample, axis=1) <= 0.18]
            cloud = nearby if len(nearby) else sample[None, :]
            gap = float(cKDTree(rail).query(cloud, k=1, workers=1)[0].mean())
            wedge.append({"frac": frac, "gap": gap})
        gaps = [item["gap"] for item in wedge]
        if gaps[-1] <= gaps[0] + 0.01:
            failures.append(f"{name} wedge does not open toward tip {gaps}")

        sil = {}
        for profile in ("silhouette180", "silhouette96"):
            rec = isolate(records, {4, 5, 6})
            projected = projected_splats(manifest, variant_entry(entry, name, {4, 5, 6}), rec, "canonical", profile)
            rgb = render_projection(projected, silhouette=True)
            sil[profile] = silhouette_metrics(rgb)
            if profile == "silhouette180" and sil[profile]["detachedBarIsland"]:
                failures.append(f"{name} 180px detached bar")
            if profile == "silhouette96" and sil[profile]["detachedBarIsland"]:
                failures.append(f"{name} 96px detached bar")

        report["variants"][name] = {
            "hash": design_hash,
            "pivot": kin,
            "contact": {
                "rootToHinge": root_gap,
                "hingeNN": hinge_nn,
                "pass": contact_pass,
                "railBoard": rail_board,
            },
            "connectivity": conn,
            "wedge": wedge,
            "lod": hinge_lod,
            "silhouette": sil,
            "presence": presence,
        }

    report["pass"] = not failures
    report["failures"] = failures
    write_json(STAGE_DIR / "reports" / "geometry-gates.json", report)
    print(json.dumps({"pass": not failures, "failures": failures, "hashes": hashes}, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
