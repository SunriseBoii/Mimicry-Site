"""PS-04.M5.5 promotion aggregate guards."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-5"
PUBLIC = ROOT / "public" / "photonic-skin" / "ps-04-m5-5"
FROZEN = ROOT / "public" / "photonic-skin" / "ps-03-m3-1r"
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
VIDEO_R1 = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873"
FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"
LOCK_HASH = "14cb2c37d5fac29b2f69a7a8ee1c342be13c67ac9007cd1b256b668663eb9392"
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


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


class Ps04M55(unittest.TestCase):
    def test_selection_lock_hash_stable(self) -> None:
        lock_path = STAGE / "selection-lock.json"
        self.assertEqual(sha(lock_path), LOCK_HASH)
        lock = load_json(lock_path)
        self.assertEqual(lock["event"]["hash"], EVENT_A_R2)
        self.assertEqual(lock["video"]["hash"], VIDEO_R1)
        self.assertEqual(lock["video"]["compositionYawDegrees"], -40)
        self.assertEqual(lock["video"]["clapperOpenAngleDegrees"], 30)
        self.assertEqual(lock["framing"]["id"], "OWNER_SELECTED_124_111_111")

    def test_single_donors_and_unaffected_identity(self) -> None:
        self.assertEqual(sha(PUBLIC / "states" / "single-event.state.bin"), EVENT_A_R2)
        self.assertEqual(sha(PUBLIC / "states" / "single-video.state.bin"), VIDEO_R1)
        self.assertEqual(sha(FROZEN / "states" / "single-video.state.bin"), FROZEN_VIDEO)
        hashes = load_json(STAGE / "reports" / "state-hash-map.json")
        impact = load_json(STAGE / "reports" / "promotion-state-impact.json")
        self.assertEqual(len(hashes), 154)
        for state_id in impact["unaffected"]:
            self.assertEqual(hashes[state_id]["candidate"], hashes[state_id]["baseline"], state_id)
            self.assertEqual(sha(PUBLIC / "states" / f"{state_id}.state.bin"), hashes[state_id]["baseline"], state_id)
        for state_id in impact["eventAndVideoIntersection"]:
            self.assertEqual(hashes[state_id]["donors"], ["EVENT_A_R2", "VIDEO_COMBO_40_R1"])

    def test_impact_partition(self) -> None:
        impact = load_json(STAGE / "reports" / "promotion-state-impact.json")
        self.assertEqual(impact["eventOnlyCount"] + impact["videoOnlyCount"] + impact["intersectionCount"] + impact["unaffectedCount"], 154)
        self.assertEqual(impact["eventContainingCount"], 83)
        self.assertEqual(impact["videoContainingCount"], 65)
        self.assertEqual(impact["eventOnlyCount"], 50)
        self.assertEqual(impact["videoOnlyCount"], 32)
        self.assertEqual(impact["intersectionCount"], 33)
        self.assertEqual(impact["unaffectedCount"], 39)

    def test_identity_lod_palette(self) -> None:
        identity = load_json(STAGE / "reports" / "identity-validation.json")
        lod = load_json(STAGE / "reports" / "lod-validation.json")
        palette = load_json(STAGE / "reports" / "palette-mask-validation.json")
        self.assertTrue(identity["allFinite"])
        self.assertEqual(identity["N"], 16384)
        self.assertEqual(identity["stride"], 40)
        self.assertEqual(len(identity["rows"]), 154)
        for row in identity["rows"]:
            self.assertTrue(row["lodPriorityIdentity"], row["stateId"])
            self.assertTrue(row["finite"], row["stateId"])
        self.assertEqual(lod["prefixes"], [512, 1024, 2048, 4096, 8192, 12288, 16384])
        for row in lod["rows"]:
            if row["hasEvent"]:
                self.assertGreater(row["prefixes"]["512"]["eventViewerRight"], 0, row["stateId"])
            if row["hasVideo"]:
                self.assertGreater(row["prefixes"]["512"]["videoCamera"], 0, row["stateId"])
                self.assertGreater(row["prefixes"]["512"]["videoClapper"], 0, row["stateId"])
        self.assertTrue(palette["allUnchanged"])

    def test_persistent_ids_not_renumbered(self) -> None:
        frozen_event = np.fromfile(FROZEN / "states" / "single-content.state.bin", dtype=STATE_DTYPE)
        promoted_event = np.fromfile(PUBLIC / "states" / "single-content.state.bin", dtype=STATE_DTYPE)
        self.assertTrue(np.array_equal(frozen_event["lodPriority"], promoted_event["lodPriority"]))
        event = np.fromfile(PUBLIC / "states" / "single-event.state.bin", dtype=STATE_DTYPE)
        frozen = np.fromfile(FROZEN / "states" / "single-event.state.bin", dtype=STATE_DTYPE)
        self.assertTrue(np.array_equal(event["lodPriority"], frozen["lodPriority"]))
        self.assertTrue(np.isfinite(event["position"]).all())
        self.assertFalse(np.isnan(event["position"]).any())

    def test_frozen_namespace_not_rewritten(self) -> None:
        self.assertEqual(sha(FROZEN / "states" / "single-video.state.bin"), FROZEN_VIDEO)
        self.assertTrue((ROOT / "public" / "photonic-skin" / "ps-03-m3-1r").is_dir())
        self.assertTrue((ROOT / "public" / "photonic-skin" / "ps-04-m5-2").is_dir())
        self.assertTrue((ROOT / "public" / "photonic-skin" / "ps-04-m5-3-r1").is_dir())
        self.assertFalse((ROOT / "design" / "photonic-skin" / "ps-04-m5-6").exists())
        bins = list((PUBLIC / "states").glob("*.state.bin"))
        self.assertEqual(len(bins), 154)

    def test_no_m56_and_not_production(self) -> None:
        manifest = load_json(STAGE / "manifest.json")
        self.assertFalse(manifest["m56Started"])
        self.assertFalse(manifest["productionApproval"])
        self.assertFalse(manifest["commitCreated"])
        self.assertFalse(manifest["push"])
        self.assertFalse(manifest["deploy"])
        self.assertIn("HUMAN PASS / INTEGRATED PROMOTION APPROVED", manifest["status"])
        self.assertTrue(manifest["integratedPromotionApproved"])
        self.assertEqual(manifest["approvedFor"], "PS-04.M5.6")
        self.assertFalse(manifest["productionDeployApproval"])
        self.assertFalse(manifest["ps04CloseApproval"])


if __name__ == "__main__":
    unittest.main()
