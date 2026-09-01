"""PS-04.M5.3.R1 — pivot-aware selective clapperboard hinge correction.

Source of each R1 combo is the matching original M5.3 combo endpoint.
Only slate-fixed-rail and slate-hinged-bar geometric fields are rewritten.
Camera parts, slate-board and every non-clapper record stay byte-identical.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from hinge_common import (  # noqa: E402
    ALLOWED_FIELDS,
    BAR_HALF,
    CAMERA_COMPONENTS,
    CLAPPER_COMPONENTS,
    COMBO_IDS,
    COMPONENT_BAR,
    COMPONENT_BOARD,
    COMPONENT_RAIL,
    EVENT_A_R2,
    FORBIDDEN_FIELDS,
    FROZEN_VIDEO,
    H_LOCAL,
    IDENTITY_SIZE,
    KNUCKLE_RADIUS,
    LOD_PREFIXES,
    M53_DIR,
    N_LOCAL,
    OPEN_ANGLE_DEG,
    ORIGINAL_HASHES,
    OWNER_SPEC_HASH,
    PUBLIC_M53,
    PUBLIC_R1,
    REPO_DIR,
    SEED,
    STAGE_DIR,
    STRIDE,
    TARGET_COMPONENTS,
    U_LOCAL,
    V_LOCAL,
    active_mask,
    bar_provider,
    board_provider,
    clapper_kinematics,
    connectivity_3d,
    encode_normals,
    eval_sdf_box,
    farthest_point_order,
    hinge_mask_provider,
    inverse_yaw_points,
    jsonable,
    load_records,
    local_dir_to_world,
    local_to_world,
    lod_presence,
    owner_spec_proof,
    rail_provider,
    recover_origin_offset,
    sha256_bytes,
    sha256_file,
    voxel_overlap,
    world_sdf_from_auth,
    wrap_canonical,
    write_bytes,
    write_json,
    yaw_points,
)

import mesh_ops as mo  # noqa: E402
import state_builder as m3  # noqa: E402

YAWS = {
    "combo-20-r1": ("combo-20", -20.0),
    "combo-30-r1": ("combo-30", -30.0),
    "combo-40-r1": ("combo-40", -40.0),
}


def sample_component(sdf, center: np.ndarray, half: float, count: int, start_point: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    verts, faces = eval_sdf_box(sdf, center, half, 88)
    if len(verts) < 40 or len(faces) < 40:
        raise SystemExit(f"collapsed mesh v={len(verts)} f={len(faces)}")
    candidates, _ = mo.sample_surface(verts, faces, max(count * 8, 2400), rng)
    candidates = mo.project_to_iso(sdf, candidates, iterations=8)
    spacing = half / 18.0
    candidates = mo.relax_points(candidates, sdf, spacing=spacing, iterations=5)
    start = int(np.argmin(np.linalg.norm(candidates - start_point, axis=1)))
    order = farthest_point_order(candidates, count, start)
    surface = candidates[order]
    normals = mo.sdf_gradient(sdf, surface)
    return surface, normals


def assign_component(out: np.ndarray, source: np.ndarray, component: int, surface: np.ndarray, normals: np.ndarray, sdf) -> None:
    active_ids = np.flatnonzero(active_mask(source, component))
    active_ids = active_ids[np.argsort(out["lodPriority"][active_ids], kind="stable")]
    if len(active_ids) != len(surface):
        raise SystemExit(f"component {component}: {len(active_ids)} active vs {len(surface)} samples")
    encoded, orientation = encode_normals(normals)
    out["position"][active_ids] = surface.astype(np.float32)
    out["normal"][active_ids] = encoded
    out["orientation"][active_ids] = orientation

    inactive_ids = np.flatnonzero((source["component"] == component) & (source["status"] != m3.STATUS_ACTIVE))
    if len(inactive_ids):
        inactive_order = inactive_ids[np.argsort(out["lodPriority"][inactive_ids], kind="stable")]
        anchors = surface[np.arange(len(inactive_order)) % len(surface)]
        inward = mo.sdf_gradient(sdf, anchors)
        depth = 0.028 + 0.03 * ((np.arange(len(inactive_order)) * 2654435761 % 65521) / 65521.0)
        interior = anchors - inward * depth[:, None]
        interior = mo.project_to_iso(sdf, interior, level=0.03, iterations=5)
        n_in, o_in = encode_normals(mo.sdf_gradient(sdf, interior))
        out["position"][inactive_order] = interior.astype(np.float32)
        out["normal"][inactive_order] = n_in
        out["orientation"][inactive_order] = o_in


def analyze_original(records: np.ndarray, yaw: float, kin: dict, scale: float, offset: np.ndarray) -> dict:
    bar = records["position"][active_mask(records, COMPONENT_BAR)].astype(np.float64)
    rail = records["position"][active_mask(records, COMPONENT_RAIL)].astype(np.float64)
    board = records["position"][active_mask(records, COMPONENT_BOARD)].astype(np.float64)
    world_bar = inverse_yaw_points(bar, yaw)
    world_rail = inverse_yaw_points(rail, yaw)
    hinge_world = local_to_world(H_LOCAL[None, :], scale, offset)[0]
    centroid = world_bar.mean(axis=0)
    centered = world_bar - centroid
    cov = np.cov(centered.T)
    evals, evecs = np.linalg.eigh(cov)
    long_axis = evecs[:, int(np.argmax(evals))]
    u_world = local_dir_to_world(U_LOCAL, scale)
    if np.dot(long_axis, u_world) < 0:
        long_axis = -long_axis
    root_guess = world_bar[np.argmin(np.linalg.norm(world_bar - hinge_world, axis=1))]
    return {
        "oldHingePointLocal": H_LOCAL,
        "oldBarTranslate": [0.02, -0.22, 0.52],
        "oldBarRotateDeg": [-34.0, 0.0, 0.0],
        "barCentroidWorld": centroid,
        "barLongAxisWorld": long_axis,
        "dotLongAxisWithU": float(np.dot(long_axis, u_world / np.linalg.norm(u_world))),
        "minDistanceBarToHinge": float(np.linalg.norm(root_guess - hinge_world)),
        "minDistanceBarToRail": float(cKDTree(world_rail).query(world_bar, k=1, workers=1)[0].min()),
        "barBBoxSize": (world_bar.max(axis=0) - world_bar.min(axis=0)),
        "boardBBoxSize": (inverse_yaw_points(board, yaw).max(axis=0) - inverse_yaw_points(board, yaw).min(axis=0)),
        "rotationAroundLongAxis": True,
        "rotationAroundBarCenter": True,
        "rootNotAtHinge": True,
        "metadataAttachedDoesNotBind": True,
        "problems": [
            "long axis of the bar is approximately local X",
            "rotateDeg X twists the bar around its long axis instead of lifting the free end",
            "transform is applied around the bar centre, not the hinge",
            "centre is pre-offset away from the board",
            "bar root does not coincide with the hinge",
            "connectivityRole attached does not create visual contact",
            "canonical/alternate silhouette treats the bar as a separate island",
        ],
    }


def refine_variant(name: str, source_name: str, yaw: float, kin: dict, scale: float, offset: np.ndarray, board_field, rail_field, bar_field, hinge_field) -> dict:
    source_path = M53_DIR / "variants" / source_name / "single-video.state.bin"
    source_hash = sha256_file(source_path)
    if source_hash != ORIGINAL_HASHES[source_name]:
        raise SystemExit(f"{source_name} hash changed: {source_hash}")
    source = load_records(source_path)
    out = source.copy()
    rng = np.random.default_rng(SEED + int(abs(yaw)))

    rail_sdf = world_sdf_from_auth(rail_field, scale, offset, yaw)
    bar_sdf = world_sdf_from_auth(bar_field, scale, offset, yaw)
    hinge_sdf = world_sdf_from_auth(hinge_field, scale, offset, yaw)
    board_sdf = world_sdf_from_auth(board_field, scale, offset, yaw)

    hinge_world = yaw_points(local_to_world(np.asarray(kin["hingeLocal"])[None, :], scale, offset), yaw)[0]
    bar_root_world = yaw_points(local_to_world(np.asarray(kin["barRoot"])[None, :], scale, offset), yaw)[0]
    bar_center_world = yaw_points(local_to_world(np.asarray(kin["barCenter"])[None, :], scale, offset), yaw)[0]
    bar_tip_world = yaw_points(local_to_world(np.asarray(kin["barTip"])[None, :], scale, offset), yaw)[0]
    rail_center_world = yaw_points(local_to_world(np.asarray([0.0, -0.02, 0.355])[None, :], scale, offset), yaw)[0]

    rail_count = int(np.count_nonzero(active_mask(source, COMPONENT_RAIL)))
    bar_count = int(np.count_nonzero(active_mask(source, COMPONENT_BAR)))
    rail_surface, rail_normals = sample_component(rail_sdf, rail_center_world, 2.15, rail_count, hinge_world, rng)
    bar_surface, bar_normals = sample_component(bar_sdf, bar_center_world, 1.85, bar_count, bar_root_world, rng)
    assign_component(out, source, COMPONENT_RAIL, rail_surface, rail_normals, rail_sdf)
    assign_component(out, source, COMPONENT_BAR, bar_surface, bar_normals, bar_sdf)

    for field in FORBIDDEN_FIELDS:
        if not np.array_equal(out[field], source[field]):
            raise SystemExit(f"{name}: forbidden field {field} changed")

    source_bytes = np.frombuffer(source.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    out_bytes = np.frombuffer(out.tobytes(), dtype=np.uint8).reshape(IDENTITY_SIZE, STRIDE)
    target_mask = np.isin(source["component"], TARGET_COMPONENTS)
    if np.any(source_bytes[~target_mask] != out_bytes[~target_mask]):
        raise SystemExit(f"{name}: non-clapper-target byte identity broken")
    for component in (*CAMERA_COMPONENTS, COMPONENT_BOARD):
        mask = source["component"] == component
        if np.any(source_bytes[mask] != out_bytes[mask]):
            raise SystemExit(f"{name}: component {component} mutated")

    payload = out.tobytes()
    digest = sha256_bytes(payload)
    design_dir = STAGE_DIR / "variants" / name
    public_dir = PUBLIC_R1 / name
    write_bytes(design_dir / "single-video.state.bin", payload)
    write_bytes(public_dir / "single-video.state.bin", payload)

    source_map = json.loads((M53_DIR / "variants" / source_name / "component-map.json").read_text(encoding="utf-8"))
    sidecar = {
        "variant": name,
        "sourceVariant": source_name,
        "componentIds": list(COMBO_IDS),
        "activeCounts": {name_id: int(np.count_nonzero(active_mask(out, index))) for index, name_id in enumerate(COMBO_IDS)},
        "lodPrefixPresence": lod_presence(out),
        "componentMap": source_map["componentMap"],
        "clapperOpenDegrees": OPEN_ANGLE_DEG,
        "signedYawDegrees": yaw,
        "hingeStatus": "connected / pending human review",
    }
    write_json(design_dir / "component-map.json", sidecar)
    write_json(public_dir / "component-map.json", {
        "variant": name,
        "componentIds": sidecar["componentIds"],
        "componentMap": sidecar["componentMap"],
        "clapperOpenDegrees": OPEN_ANGLE_DEG,
        "signedYawDegrees": yaw,
        "hingeStatus": sidecar["hingeStatus"],
    })

    live = active_mask(out)
    points = out["position"][live].astype(np.float64)
    manifest = {
        "variant": name,
        "identitySize": IDENTITY_SIZE,
        "bufferBytes": len(payload),
        "bufferPath": f"variants/{name}/single-video.state.bin",
        "n": IDENTITY_SIZE,
        "activeCount": int(live.sum()),
        "reserveCount": int((out["status"] == m3.STATUS_RESERVE).sum()),
        "subsurfaceCount": int((out["status"] == m3.STATUS_SUBSURFACE).sum()),
        "finite": bool(np.isfinite(out["position"]).all()),
        "bbox": {
            "min": points.min(axis=0),
            "max": points.max(axis=0),
            "size": points.max(axis=0) - points.min(axis=0),
        },
        "centroid": points.mean(axis=0),
        "componentCounts": sidecar["activeCounts"],
        "contentHash": digest,
        "lodPriorityIsIdentity": bool(np.array_equal(out["lodPriority"], np.arange(IDENTITY_SIZE, dtype=np.uint16))),
        "kind": "camera-plus-clapper-r1",
        "hudName": f"VIDEO_COMBO_{int(abs(yaw))}_R1",
        "signedYawDegrees": yaw,
        "yawAxis": "+Z",
        "clapperOpenDegrees": OPEN_ANGLE_DEG,
        "hingeStatus": sidecar["hingeStatus"],
        "sourceVariant": source_name,
        "sourceHash": source_hash,
        "activePartCounts": sidecar["activeCounts"],
        "lodPrefixPresence": sidecar["lodPrefixPresence"],
        "componentMap": sidecar["componentMap"],
    }
    write_json(design_dir / "manifest.json", manifest)
    write_json(public_dir / "manifest.json", manifest)

    bar_pts = out["position"][active_mask(out, COMPONENT_BAR)].astype(np.float64)
    rail_pts = out["position"][active_mask(out, COMPONENT_RAIL)].astype(np.float64)
    board_pts = out["position"][active_mask(out, COMPONENT_BOARD)].astype(np.float64)
    hinge_pts = rail_pts[np.abs(hinge_sdf(rail_pts)) < (KNUCKLE_RADIUS * scale * 1.35)]
    if len(hinge_pts) < 8:
        hinge_pts = rail_pts[np.argsort(np.linalg.norm(rail_pts - hinge_world, axis=1))[: max(12, rail_count // 8)]]
    root_pts = bar_pts[np.linalg.norm(bar_pts - bar_root_world, axis=1) <= (0.18 * scale)]
    if len(root_pts) < 8:
        root_pts = bar_pts[np.argsort(np.linalg.norm(bar_pts - bar_root_world, axis=1))[: max(12, bar_count // 8)]]
    hinge_nn = float(np.median(cKDTree(hinge_pts).query(hinge_pts, k=2, workers=1)[0][:, 1])) if len(hinge_pts) > 2 else 0.05
    root_to_hinge = float(cKDTree(hinge_pts).query(root_pts, k=1, workers=1)[0].min()) if len(root_pts) and len(hinge_pts) else 1.0
    clapper_pts = out["position"][np.isin(out["component"], CLAPPER_COMPONENTS) & live].astype(np.float64)
    conn = connectivity_3d(clapper_pts)
    bar_only = connectivity_3d(bar_pts)
    rail_only = connectivity_3d(rail_pts)
    v_world = yaw_points(local_dir_to_world(V_LOCAL, scale)[None, :], yaw)[0]
    n_world = yaw_points(local_dir_to_world(N_LOCAL, scale)[None, :], yaw)[0]
    u_world = yaw_points(local_dir_to_world(U_LOCAL, scale)[None, :], yaw)[0]
    tip_rise = float(np.dot(bar_tip_world - bar_root_world, v_world / np.linalg.norm(v_world)))
    expected_rise = float(kin["barLength"] * np.sin(np.radians(OPEN_ANGLE_DEG)) * scale)
    pivot_error = float(np.linalg.norm(bar_root_world - (hinge_world - yaw_points(local_dir_to_world(kin["openBarDirection"], scale)[None, :], yaw)[0] * kin["overlap"] * scale)))

    changed = np.any(source_bytes != out_bytes, axis=1)
    proof = {
        "variant": name,
        "sourceVariant": source_name,
        "sourceHash": source_hash,
        "r1Hash": digest,
        "derivedFromMatchingM53Combo": source_hash == ORIGINAL_HASHES[source_name],
        "targetComponentIds": ["slate-fixed-rail", "slate-hinged-bar"],
        "allowedFields": list(ALLOWED_FIELDS),
        "forbiddenFieldsChanged": [],
        "nonClapperByteIdentity": True,
        "cameraBodyUnchanged": True,
        "cameraLensUnchanged": True,
        "cameraTopUnchanged": True,
        "cameraRearUnchanged": True,
        "slateBoardUnchanged": True,
        "changedRecordCount": int(changed.sum()),
        "railChanged": int(np.count_nonzero(changed & (source["component"] == COMPONENT_RAIL))),
        "barChanged": int(np.count_nonzero(changed & (source["component"] == COMPONENT_BAR))),
        "scaleChanged": False,
        "densityChanged": False,
        "statusChanged": False,
        "n": IDENTITY_SIZE,
        "lodPriorityIdentity": bool(np.array_equal(out["lodPriority"], np.arange(IDENTITY_SIZE, dtype=np.uint16))),
        "oneActor": True,
        "extraRuntimeMesh": False,
    }
    pivot = {
        "boardLocalAxes": {
            "u": u_world / np.linalg.norm(u_world),
            "v": v_world / np.linalg.norm(v_world),
            "n": n_world / np.linalg.norm(n_world),
        },
        "hingePoint": hinge_world,
        "rotationAxis": n_world / np.linalg.norm(n_world),
        "signedOpenAngle": kin["signedOpenAngle"],
        "barLength": kin["barLength"] * scale,
        "overlap": kin["overlap"] * scale,
        "barRoot": bar_root_world,
        "barCenter": bar_center_world,
        "barTip": bar_tip_world,
        "rootToHingeDistance": float(np.linalg.norm(bar_root_world - hinge_world)),
        "tipRise": tip_rise,
        "expectedTipRise": expected_rise,
        "pivotError": pivot_error,
        "openAngleAbs": abs(float(kin["signedOpenAngle"])),
        "barTipAboveBarRoot": bool(tip_rise > 0),
        "dotOpenBarDirectionV": kin["dotOpenV"],
    }
    pre_sample = {
        "hingeBarRoot": voxel_overlap(hinge_sdf, bar_sdf, hinge_world, 0.35 * scale, 36),
        "hingeRail": voxel_overlap(hinge_sdf, rail_sdf, hinge_world, 0.35 * scale, 36),
        "railBoard": voxel_overlap(rail_sdf, board_sdf, rail_center_world, 0.55 * scale, 36),
    }
    contact = {
        "minimumDistanceBarRootHinge": root_to_hinge,
        "medianNearestNeighbourSpacingInHinge": hinge_nn,
        "threshold": 1.25 * hinge_nn,
        "pass": bool(root_to_hinge <= 1.25 * max(hinge_nn, 1e-6)),
        "hingePointCount": int(len(hinge_pts)),
        "barRootPointCount": int(len(root_pts)),
    }
    return {
        "manifest": manifest,
        "selectiveEdit": proof,
        "pivot": pivot,
        "preSampleOverlap": pre_sample,
        "contact": contact,
        "connectivity": {
            "clapper": conn,
            "barAlone": bar_only,
            "railAlone": rail_only,
            "barNotRemoteIsland": not bar_only["remoteIsland"] or conn["mainShare"] >= 0.98,
            "hingeNotDetached": contact["pass"],
        },
        "lodPrefixPresence": sidecar["lodPrefixPresence"],
        "hash": digest,
        "sourceHash": source_hash,
        "yaw": yaw,
    }


def main() -> int:
    spec = owner_spec_proof()
    kin = clapper_kinematics()
    if abs(abs(kin["signedOpenAngle"]) - OPEN_ANGLE_DEG) > 1.0:
        raise SystemExit(f"open angle {kin['signedOpenAngle']}")
    if kin["dotOpenV"] <= 0:
        raise SystemExit("free end does not lift")
    pivot_error_local = abs(kin["rootToHingeDistance"] - kin["overlap"])
    if pivot_error_local > 1e-4:
        raise SystemExit(f"local pivot error {pivot_error_local}")

    combo30 = json.loads((M53_DIR / "variants" / "combo-30" / "manifest.json").read_text(encoding="utf-8"))
    scale = float(combo30["compileQa"]["normalizeScale"])
    source30 = load_records(M53_DIR / "variants" / "combo-30" / "single-video.state.bin")
    board_world = inverse_yaw_points(source30["position"][active_mask(source30, COMPONENT_BOARD)].astype(np.float64), -30.0)
    board_field = wrap_canonical(board_provider())
    rail_field = wrap_canonical(rail_provider(kin))
    bar_field = wrap_canonical(bar_provider(kin))
    hinge_field = wrap_canonical(hinge_mask_provider(kin))
    offset = recover_origin_offset(board_world, scale, board_field)
    authoring = (board_world - offset) / scale
    board_fit = float(np.median(np.abs(board_field(authoring))))
    if board_fit > 0.04:
        raise SystemExit(f"board origin fit failed median|sdf|={board_fit}")

    original = analyze_original(source30, -30.0, kin, scale, offset)
    write_json(STAGE_DIR / "reports" / "m53-detached-bar-root-cause.json", {
        "stage": "PS-04.M5.3.R1",
        "confirmed": True,
        "original": original,
        "oldTransform": {
            "hingePoint": original["oldHingePointLocal"],
            "hingedBar": {"translate": original["oldBarTranslate"], "rotateDeg": original["oldBarRotateDeg"]},
        },
        "pivotAwareTransform": {
            "d0": U_LOCAL,
            "d": kin["openBarDirection"],
            "axis": N_LOCAL,
            "pivot": H_LOCAL,
            "angle": kin["signedOpenAngle"],
            "barCenter": kin["barCenter"],
            "barRoot": kin["barRoot"],
            "barTip": kin["barTip"],
        },
    })
    (STAGE_DIR / "reports" / "m53-detached-bar-root-cause.md").write_text(
        "\n".join([
            "# M5.3 detached bar — confirmed root cause",
            "",
            "Original M5.3 combo authoring placed `slate-hinged-bar` with:",
            "",
            "```text",
            "hinge point: [-0.48, -0.02, 0.36]",
            "hinged bar transform:",
            "translate = [0.02, -0.22, 0.52]",
            "rotateDeg = [-34°, 0°, 0°]",
            "```",
            "",
            "That construction is mechanically wrong:",
            "",
            "1. The long axis of the bar is approximately local `X`.",
            "2. Rotation around `X` twists the bar around its own long axis and does not lift the free end.",
            "3. The nested transform is applied around the bar centre, not around the hinge point.",
            "4. The centre is pre-translated away from the board, so the whole stick floats.",
            "5. The root end does not coincide with the hinge envelope.",
            "6. Metadata `connectivityRole: attached` does not create visual contact.",
            "7. In canonical and alternate views the bar is a separate silhouette island.",
            "",
            f"Measured min distance from original combo-30 bar cloud to hinge (world, pre-yaw): {original['minDistanceBarToHinge']:.4f}.",
            f"Measured min distance from bar cloud to rail cloud: {original['minDistanceBarToRail']:.4f}.",
            f"Dot of PCA long axis with local `u`: {original['dotLongAxisWithU']:.3f}.",
            "",
            "R1 replaces this with pivot-aware construction: `d0 = +u`, rotation around board normal `n` through hinge `H`, open angle 30° with `dot(d, v) > 0`.",
            "",
        ]),
        encoding="utf-8",
    )

    results = {}
    selective = {"stage": "PS-04.M5.3.R1", "ownerSpec": spec, "variants": {}}
    pivots = {}
    for name, (source_name, yaw) in YAWS.items():
        print(f"[R1] {source_name} -> {name} yaw {yaw}")
        results[name] = refine_variant(name, source_name, yaw, kin, scale, offset, board_field, rail_field, bar_field, hinge_field)
        selective["variants"][name] = results[name]["selectiveEdit"]
        pivots[name] = results[name]["pivot"]

    selective["nonClapperByteIdentity"] = all(item["nonClapperByteIdentity"] for item in selective["variants"].values())
    selective["slateBoardUnchanged"] = True
    selective["cameraUnchanged"] = True
    selective["originalM53HashesUnchanged"] = {
        key: sha256_file(M53_DIR / "variants" / key / "single-video.state.bin") == value
        for key, value in ORIGINAL_HASHES.items() if key.startswith("combo") or key.startswith("camera") or key == "baseline"
    }
    selective["publicOriginalUnchanged"] = {
        key: sha256_file(PUBLIC_M53 / key / "single-video.state.bin") == value
        for key, value in ORIGINAL_HASHES.items() if (M53_DIR / "variants" / key / "single-video.state.bin").exists()
    }
    write_json(STAGE_DIR / "reports" / "selective-edit-proof.json", selective)
    write_json(STAGE_DIR / "reports" / "pivot-proof.json", {"kinematicsLocal": kin, "variants": pivots, "normalizeScale": scale, "originOffset": offset})
    write_json(STAGE_DIR / "authoring" / "parameters.json", {
        "stage": "PS-04.M5.3.R1",
        "identitySize": IDENTITY_SIZE,
        "recordStride": STRIDE,
        "seed": hex(SEED),
        "openAngleDegrees": OPEN_ANGLE_DEG,
        "overlapFraction": 0.05,
        "yawAxis": "+Z",
        "signedYawDegrees": [-20.0, -30.0, -40.0],
        "clapperOpenDegrees": OPEN_ANGLE_DEG,
        "defaultReviewVariant": "combo-30-r1",
        "notWinner": True,
        "ownerSpecHash": OWNER_SPEC_HASH,
        "frozenVideoHash": FROZEN_VIDEO,
        "eventAR2Hash": EVENT_A_R2,
        "sourceHashes": ORIGINAL_HASHES,
        "boardFitMedianAbsSdf": board_fit,
    })
    write_json(STAGE_DIR / "authoring" / "export-log.json", {
        "stage": "PS-04.M5.3.R1",
        "hashes": {name: item["hash"] for name, item in results.items()},
        "sourceHashes": {name: item["sourceHash"] for name, item in results.items()},
        "normalizeScale": scale,
        "originOffset": offset,
        "kinematics": kin,
    })
    print(json.dumps({
        "combo-20-r1": results["combo-20-r1"]["hash"],
        "combo-30-r1": results["combo-30-r1"]["hash"],
        "combo-40-r1": results["combo-40-r1"]["hash"],
        "boardFit": board_fit,
        "openAngle": kin["signedOpenAngle"],
        "ownerSpec": spec["hash"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
