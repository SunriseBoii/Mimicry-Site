"""Build the PS-04 release Event geometry without modifying approved M5.5/M6.1 payloads.

The viewer-right figure is component ``figure-left`` in Event's rotated
presentation.  Every patch changes only position, normal and orientation for
that component; persistent IDs, palette fields and all other components remain
byte identical.  The full resulting state hash is recorded so the browser can
verify both the frozen source and the release overlay.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[4]
DESIGN = ROOT / "design" / "photonic-skin" / "ps-04-final-r1"
PUBLIC = ROOT / "public" / "photonic-skin" / "ps-04-final-r1"
BASE_PUBLIC = ROOT / "public" / "photonic-skin"
N = 16384

STATE = np.dtype([
    ("position", "<f4", (3,)),
    ("normal", "<i2", (3,)),
    ("orientation", "<i2", (4,)),
    ("scale", "<f2"), ("reserveDepth", "<f2"),
    ("component", "u1"), ("shell", "u1"), ("status", "u1"),
    ("flags", "u1"), ("density", "u1"), ("transitionGroup", "u1"),
    ("lodPriority", "<u2"), ("_padding", "u1", (2,)),
])
PATCH = np.dtype([
    ("id", "<u2"), ("position", "<f4", (3,)),
    ("normal", "<i2", (3,)), ("orientation", "<i2", (4,)),
])
assert STATE.itemsize == 40 and PATCH.itemsize == 28


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize(rows: np.ndarray) -> np.ndarray:
    return rows / np.maximum(np.linalg.norm(rows, axis=1, keepdims=True), 1e-12)


def radial_profile(t: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Carve a readable neck while retaining R2's torso and round head."""
    neck_x = (t - 0.72) / 0.078
    head_x = (t - 0.866) / 0.083
    neck = np.exp(-(neck_x * neck_x))
    head = np.exp(-(head_x * head_x))
    factor = 1.0 - 0.355 * neck + 0.058 * head
    derivative_t = 0.710 * neck * neck_x / 0.078 - 0.116 * head * head_x / 0.083
    return factor, derivative_t


def warp_component(source: np.ndarray, component: int, outward_fraction: float = 0.0) -> tuple[np.ndarray, np.ndarray, dict]:
    mask = source["component"] == component
    active = mask & (source["status"] == 0)
    if int(active.sum()) < 100:
        raise ValueError(f"viewer-right active count too small: {int(active.sum())}")
    output = source.copy()
    ids = np.flatnonzero(mask)
    active_positions = source["position"][active].astype(np.float64)
    center = active_positions[:, :2].mean(axis=0)
    bottom = float(active_positions[:, 2].min())
    height = float(np.ptp(active_positions[:, 2]))
    if not 0.2 < height < 4:
        raise ValueError(f"viewer-right height unexpected: {height}")
    original = source["position"][ids].astype(np.float64)
    relative = original[:, :2] - center
    t = (original[:, 2] - bottom) / height
    factor, derivative_t = radial_profile(t)
    warped = original.copy()
    warped[:, :2] = center + factor[:, None] * relative
    # On the canonical Event single, the white viewer-right figure sat fully
    # inside the equally white portal's right upright. This small outward move
    # reveals its head/shoulder contour while keeping its foot on the deck.
    warped[:, 0] += outward_fraction * height
    output["position"][ids] = warped.astype(np.float32)

    normals = normalize(source["normal"][ids].astype(np.float64) / 32767.0)
    new_normals = normals.copy()
    new_normals[:, :2] /= factor[:, None]
    new_normals[:, 2] -= derivative_t / height / factor * np.einsum("ij,ij->i", normals[:, :2], relative)
    new_normals = normalize(new_normals)
    output["normal"][ids] = np.rint(np.clip(new_normals, -1, 1) * 32767).astype(np.int16)
    quaternion = np.column_stack((-new_normals[:, 1], new_normals[:, 0], np.zeros(len(ids)), 1 + new_normals[:, 2]))
    quaternion[quaternion[:, 3] < 1e-8] = (1.0, 0.0, 0.0, 0.0)
    output["orientation"][ids] = np.rint(np.clip(normalize(quaternion), -1, 1) * 32767).astype(np.int16)

    for field in ("scale", "reserveDepth", "component", "shell", "status", "flags", "density", "transitionGroup", "lodPriority", "_padding"):
        if not np.array_equal(output[field], source[field]):
            raise AssertionError(f"non-geometry field changed: {field}")
    raw_before = np.frombuffer(source.tobytes(), dtype=np.uint8).reshape(N, 40)
    raw_after = np.frombuffer(output.tobytes(), dtype=np.uint8).reshape(N, 40)
    if np.any(raw_before[~mask] != raw_after[~mask]):
        raise AssertionError("non-target component changed")
    if np.any(raw_before[mask, 26:] != raw_after[mask, 26:]):
        raise AssertionError("target metadata changed")

    patch = np.empty(len(ids), dtype=PATCH)
    patch["id"] = ids.astype(np.uint16)
    for field in ("position", "normal", "orientation"):
        patch[field] = output[field][ids]
    proof = {
        "component": component,
        "recordCount": len(ids),
        "activeCount": int(active.sum()),
        "centreXY": center.tolist(),
        "bottomZ": bottom,
        "height": height,
        "outwardShiftX": outward_fraction * height,
        "nonTargetByteIdentical": True,
        "metadataByteIdentical": True,
    }
    return output, patch, proof


def width_at(points: np.ndarray, center: np.ndarray, bottom: float, height: float, low: float, high: float) -> float:
    t = (points[:, 2] - bottom) / height
    selected = points[(t >= low) & (t < high)]
    radius = np.linalg.norm(selected[:, :2] - center, axis=1)
    return float(2 * np.quantile(radius, 0.9))


def render_silhouette(records: np.ndarray, component: int, size: int, path: Path) -> None:
    points = records["position"][(records["component"] == component) & (records["status"] == 0)]
    x = points[:, 0].astype(float)
    z = points[:, 2].astype(float)
    span = max(float(np.ptp(x)), float(np.ptp(z)))
    scale = size * 0.77 / span
    xp = (x - float((x.min() + x.max()) / 2)) * scale + size / 2
    yp = size / 2 - (z - float((z.min() + z.max()) / 2)) * scale
    image = Image.new("RGB", (size, size), "black")
    draw = ImageDraw.Draw(image)
    radius = max(1, round(size / 145))
    for px, py in zip(xp, yp):
        draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill="white")
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def main() -> None:
    entries: list[dict] = []
    for namespace, manifest_name in (("ps-04-m5-5", "ps04m55-manifest.json"), ("ps-04-m6-1", "ps04m61-delta-manifest.json")):
        manifest = read_json(BASE_PUBLIC / namespace / "manifests" / manifest_name)
        entries.extend((namespace, item) for item in manifest["states"] if "event" in item["competencyIds"])
    if len(entries) != 203:
        raise AssertionError(f"expected 203 Event-bearing states; found {len(entries)}")

    release: dict[str, dict] = {}
    proof_rows = []
    for namespace, entry in entries:
        state_id = entry["stateId"]
        source_path = BASE_PUBLIC / namespace / entry["bufferPath"]
        source_bytes = source_path.read_bytes()
        if digest(source_bytes) != entry["contentHash"]:
            raise AssertionError(f"frozen source hash mismatch: {state_id}")
        source = np.frombuffer(source_bytes, dtype=STATE).copy()
        if len(source) != N:
            raise AssertionError(f"identity size mismatch: {state_id}")
        component = next((int(item["componentIndex"]) for item in entry["componentMap"] if item.get("competencyId") == "event" and item.get("componentId") == "figure-left"), None)
        if component is None:
            raise AssertionError(f"Event viewer-right component missing: {state_id}")
        output, patch, proof = warp_component(source, component, 0.18 if state_id == "single-event" else 0.0)
        patch_bytes = patch.tobytes()
        patched_bytes = output.tobytes()
        patch_path = f"patches/{state_id}.event-right.bin"
        dest = PUBLIC / patch_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(patch_bytes)
        release[state_id] = {
            "sourceNamespace": namespace,
            "sourceHash": entry["contentHash"],
            "resultHash": digest(patched_bytes),
            "patchPath": patch_path,
            "patchHash": digest(patch_bytes),
            "patchBytes": len(patch_bytes),
            "recordCount": len(patch),
            "componentIndex": component,
        }
        proof_rows.append({"stateId": state_id, "sourceNamespace": namespace, **proof})
        if state_id == "single-event":
            donor_path = PUBLIC / "event-a-r3.state.bin"
            donor_path.write_bytes(patched_bytes)
            center = np.asarray(proof["centreXY"])
            revised_center = center + np.asarray([proof["outwardShiftX"], 0.0])
            original_pts = source["position"][(source["component"] == component) & (source["status"] == 0)].astype(float)
            revised_pts = output["position"][(output["component"] == component) & (output["status"] == 0)].astype(float)
            neck_before = width_at(original_pts, center, proof["bottomZ"], proof["height"], 0.69, 0.76)
            neck_after = width_at(revised_pts, revised_center, proof["bottomZ"], proof["height"], 0.69, 0.76)
            head_after = width_at(revised_pts, revised_center, proof["bottomZ"], proof["height"], 0.82, 0.90)
            proof["neckWidthBefore"] = neck_before
            proof["neckWidthAfter"] = neck_after
            proof["headWidthAfter"] = head_after
            proof["headToNeckRatio"] = head_after / neck_after
            if proof["headToNeckRatio"] < 1.25:
                raise AssertionError("head/neck distinction remains too weak")
            proof_rows[-1].update(proof)
            for size in (180, 96):
                render_silhouette(source, component, size, DESIGN / "renders" / f"event-a-r2-right-{size}.png")
                render_silhouette(output, component, size, DESIGN / "renders" / f"event-a-r3-right-{size}.png")

    write_json(PUBLIC / "manifest.json", {
        "stage": "PS-04.final-r1",
        "identitySize": N,
        "sourceNamespaces": ["ps-04-m5-5", "ps-04-m6-1"],
        "eventDonor": "EVENT_A_R3",
        "eventDonorHash": release["single-event"]["resultHash"],
        "patchRecordStride": PATCH.itemsize,
        "patchFields": ["id:u16", "position:f32x3", "normal:i16x3", "orientation:i16x4"],
        "states": release,
    })
    write_json(DESIGN / "reports" / "geometry-proof.json", {
        "stage": "PS-04.final-r1",
        "stateCount": len(release),
        "frozenSourcesUnchanged": True,
        "allPatchesGeometryOnly": True,
        "singleEvent": next(row for row in proof_rows if row["stateId"] == "single-event"),
        "stateProof": proof_rows,
    })
    print(f"Event R3 {release['single-event']['resultHash']}; patched states {len(release)}")


if __name__ == "__main__":
    main()
