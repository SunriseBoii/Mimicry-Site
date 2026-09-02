"""PS-04.M6.1 asset, identity, and donor proofs."""

from __future__ import annotations

import hashlib
import json
import unittest
from itertools import combinations
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m6-1"
PUBLIC = ROOT / "public" / "photonic-skin" / "ps-04-m6-1"
PUBLIC_M55 = ROOT / "public" / "photonic-skin" / "ps-04-m5-5"
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
VIDEO_R1 = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873"
FROZEN_M55_MANIFEST = "69c3e5aa26b99a7d6564f1e4a58d67e5b928294c7f9f617b69cb142c662cc46a"
ORDER = ("content", "design", "digital", "event", "games", "merch", "video")
EXISTING_PREFIX = {
    ("content", "design"),
    ("content", "design", "digital"),
    ("content", "design", "digital", "event"),
    ("content", "design", "digital", "event", "games"),
    ("content", "design", "digital", "event", "games", "merch"),
}
STATE_DTYPE = np.dtype([
    ("position", "<f4", (3,)),
    ("normal", "<i2", (3,)),
    ("orientation", "<i2", (4,)),
    ("scale", "<f2"),
    ("reserveDepth", "<f2"),
    ("component", "u1"),
    ("shell", "u1"),
    ("status", "u1"),
    ("flags", "u1"),
    ("density", "u1"),
    ("transitionGroup", "u1"),
    ("lodPriority", "<u2"),
    ("_padding", "u1", (2,)),
])
LOD_PREFIXES = (512, 1024, 2048, 4096, 8192, 12288, 16384)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def multi_sets():
    for cardinality in range(2, 8):
        yield from combinations(ORDER, cardinality)


class Ps04M61(unittest.TestCase):
    def test_delta_is_exactly_230_new_states(self) -> None:
        delta = load_json(PUBLIC / "manifests" / "ps04m61-delta-manifest.json")
        bins = sorted((PUBLIC / "states").glob("*.state.bin"))
        self.assertEqual(delta["stage"], "PS-04.M6.1")
        self.assertEqual(delta["newStateCount"], 230)
        self.assertEqual(len(delta["states"]), 230)
        self.assertEqual(len(bins), 230)
        self.assertEqual(delta["frozenManifestSha256"], FROZEN_M55_MANIFEST)
        self.assertEqual(sha(PUBLIC_M55 / "manifests" / "ps04m55-manifest.json"), FROZEN_M55_MANIFEST)
        self.assertEqual(delta["event"]["hash"], EVENT_A_R2)
        self.assertEqual(delta["video"]["hash"], VIDEO_R1)
        self.assertEqual(delta["overlays"], "none")
        self.assertEqual(delta["runtimeRotationOverride"], "none")
        self.assertEqual(len(delta["resolverMap"]), 248)

    def test_prefix_sets_remain_m55_and_all_seven_are_project_complex(self) -> None:
        delta = load_json(PUBLIC / "manifests" / "ps04m61-delta-manifest.json")
        m55 = load_json(PUBLIC_M55 / "manifests" / "ps04m55-manifest.json")
        m55_ids = {item["stateId"] for item in m55["states"]}
        delta_ids = {item["stateId"] for item in delta["states"]}
        for competencies in EXISTING_PREFIX:
            for mode in ("gather", "drive"):
                state_id = f"complex-{mode}-{'-'.join(competencies)}"
                self.assertIn(state_id, m55_ids)
                self.assertNotIn(state_id, delta_ids)
                self.assertFalse((PUBLIC / "states" / f"{state_id}.state.bin").exists())
        gather_seven = "complex-gather-content-design-digital-event-games-merch-video"
        drive_seven = "complex-drive-content-design-digital-event-games-merch-video"
        self.assertIn(gather_seven, delta_ids)
        self.assertIn(drive_seven, delta_ids)
        brand_gather = next(item for item in m55["states"] if item["stateId"] == "brand-wide-gather-content-design-digital-event-games-merch-video")
        brand_drive = next(item for item in m55["states"] if item["stateId"] == "brand-wide-drive-content-design-digital-event-games-merch-video")
        project_gather = next(item for item in delta["states"] if item["stateId"] == gather_seven)
        project_drive = next(item for item in delta["states"] if item["stateId"] == drive_seven)
        self.assertEqual(project_gather["contentHash"], brand_gather["contentHash"])
        self.assertEqual(project_drive["contentHash"], brand_drive["contentHash"])
        self.assertEqual(project_gather["stateRole"], "complex")
        self.assertEqual(project_drive["stateRole"], "complex")
        self.assertNotEqual(project_gather["stateId"], brand_gather["stateId"])

    def test_exact_owners_finite_identity_and_donors(self) -> None:
        integrity = load_json(STAGE / "reports" / "asset-integrity.json")
        identity = load_json(STAGE / "reports" / "identity-lod.json")
        self.assertTrue(integrity["allExactOwners"])
        self.assertTrue(integrity["allFinite"])
        self.assertEqual(integrity["newStateCount"], 230)
        self.assertEqual(identity["N"], 16384)
        self.assertEqual(identity["stride"], 40)
        self.assertTrue(identity["allFinite"])
        by_id = {row["stateId"]: row for row in integrity["rows"]}
        required = []
        for competencies in multi_sets():
            if competencies in EXISTING_PREFIX:
                continue
            for mode in ("gather", "drive"):
                required.append(f"complex-{mode}-{'-'.join(competencies)}")
        self.assertEqual(len(required), 230)
        for state_id in required:
            row = by_id[state_id]
            path = PUBLIC / "states" / f"{state_id}.state.bin"
            payload = path.read_bytes()
            self.assertEqual(len(payload), 16384 * 40)
            self.assertEqual(sha(path), row["contentHash"])
            records = np.frombuffer(payload, dtype=STATE_DTYPE)
            self.assertEqual(len(records), 16384)
            self.assertTrue(np.isfinite(records["position"]).all())
            order = np.argsort(records["lodPriority"], kind="stable")
            for prefix in LOD_PREFIXES:
                subset = records[order[:prefix]]
                self.assertTrue(np.isfinite(subset["position"]).all())
            if "event" in row["competencies"]:
                self.assertIn("EVENT_A_R2", row["donors"])
            if "video" in row["competencies"]:
                self.assertIn("VIDEO_COMBO_40_R1", row["donors"])
            self.assertFalse(state_id.startswith("complex-focus-"))
            self.assertFalse(state_id.startswith("brand-wide-"))

    def test_m55_payload_unchanged(self) -> None:
        m55 = load_json(PUBLIC_M55 / "manifests" / "ps04m55-manifest.json")
        self.assertEqual(len(m55["states"]), 154)
        self.assertEqual(sha(PUBLIC_M55 / "states" / "single-event.state.bin"), EVENT_A_R2)
        self.assertEqual(sha(PUBLIC_M55 / "states" / "single-video.state.bin"), VIDEO_R1)
        self.assertEqual(len(list((PUBLIC_M55 / "states").glob("*.state.bin"))), 154)


if __name__ == "__main__":
    unittest.main()
