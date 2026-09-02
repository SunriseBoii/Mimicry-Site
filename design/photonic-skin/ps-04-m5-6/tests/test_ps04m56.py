"""PS-04.M5.6 release-binding and payload-immutability guards."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-6"
PUBLIC = ROOT / "public" / "photonic-skin" / "ps-04-m5-5"
FROZEN = ROOT / "public" / "photonic-skin" / "ps-03-m3-1r"
M55 = ROOT / "design" / "photonic-skin" / "ps-04-m5-5"
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
VIDEO_R1 = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873"
FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"
LOCK_HASH = "14cb2c37d5fac29b2f69a7a8ee1c342be13c67ac9007cd1b256b668663eb9392"
CHECKPOINT = "184c696eb5455da762ac47e2dcd9035ad8236a78"
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


class Ps04M56(unittest.TestCase):
    def test_human_pass_and_checkpoint(self) -> None:
        review = (M55 / "reports" / "human-review.md").read_text(encoding="utf-8")
        m55 = load_json(M55 / "manifest.json")
        lock = load_json(STAGE / "release-lock.json")
        self.assertIn("HUMAN PASS / INTEGRATED PROMOTION APPROVED", review)
        self.assertTrue(m55["integratedPromotionApproved"])
        self.assertEqual(m55["approvedFor"], "PS-04.M5.6")
        self.assertFalse(m55["m56Started"])
        self.assertEqual(lock["sourceCheckpoint"], CHECKPOINT)
        self.assertEqual(lock["payloadNamespace"], "ps-04-m5-5")
        self.assertEqual(lock["selectionLockHash"], LOCK_HASH)
        self.assertFalse(lock["deployApproved"])
        self.assertFalse(lock["ps04Closed"])

    def test_payload_immutable(self) -> None:
        self.assertEqual(sha(PUBLIC / "states" / "single-event.state.bin"), EVENT_A_R2)
        self.assertEqual(sha(PUBLIC / "states" / "single-video.state.bin"), VIDEO_R1)
        self.assertEqual(sha(FROZEN / "states" / "single-video.state.bin"), FROZEN_VIDEO)
        hashes = load_json(M55 / "reports" / "state-hash-map.json")
        lock = load_json(STAGE / "release-lock.json")
        self.assertEqual(len(hashes), 154)
        self.assertEqual(lock["hashes"]["stateHashMap"], sha(M55 / "reports" / "state-hash-map.json"))
        self.assertEqual(lock["hashes"]["promotedManifest"], sha(PUBLIC / "manifests" / "ps04m55-manifest.json"))
        bins = list((PUBLIC / "states").glob("*.state.bin"))
        self.assertEqual(len(bins), 154)
        for state_id, row in hashes.items():
            self.assertEqual(sha(PUBLIC / "states" / f"{state_id}.state.bin"), row["candidate"], state_id)

    def test_full_pair_probe_required(self) -> None:
        probe = load_json(STAGE / "reports" / "full-pair-probe.json")
        self.assertTrue(probe["endpointChecks"]["pass"])
        self.assertTrue(probe["selfTransitions"]["pass"])
        self.assertEqual(probe["fullOrderedPairProbe"]["expected"], 23562)
        self.assertEqual(probe["fullOrderedPairProbe"]["probed"], 23562)
        self.assertEqual(probe["fullOrderedPairProbe"]["failed"], 0)
        self.assertTrue(probe["fullOrderedPairProbe"]["ran"])
        self.assertFalse(probe["fullOrderedPairProbe"]["thirdGeometry"])
        self.assertTrue(probe["pass"])

    def test_m56_human_pass_m6_baseline(self) -> None:
        review = (STAGE / "reports" / "human-review.md").read_text(encoding="utf-8")
        manifest = load_json(STAGE / "manifest.json")
        self.assertIn("HUMAN PASS / APPROVED AS PS-04.M6 BASELINE", review)
        self.assertEqual(manifest["status"], "HUMAN PASS / APPROVED AS PS-04.M6 BASELINE")
        self.assertEqual(manifest["payloadNamespace"], "ps-04-m5-5")
        self.assertEqual(
            manifest["releaseLockHash"],
            "a8609556f082e754f9d803611afee106cdb1069c2e713df579a8200e9ec6aae7",
        )
        self.assertEqual(sha(STAGE / "release-lock.json"), manifest["releaseLockHash"])
        self.assertFalse(manifest["productionReady"])
        self.assertFalse(manifest["deployApproval"])
        self.assertFalse(manifest["ps04CloseApproval"])
        self.assertFalse(manifest["m61Started"])
        self.assertEqual(
            manifest["carryForwardToM6"],
            [
                "build-chapter-mimic-semantics",
                "settled-screen-motion-policy",
                "light-theme-scale-material",
                "video-games-merch-remote-particles",
                "first-actor-performance",
                "SSR-client-boundary",
                "visible-actor-context-restore",
                "legacy-motion-manifest-dependency",
            ],
        )

    def test_no_deploy_and_not_closed(self) -> None:
        manifest = load_json(STAGE / "manifest.json")
        self.assertFalse(manifest["deployApproved"])
        self.assertFalse(manifest["ps04Closed"])
        self.assertFalse(manifest["push"])
        self.assertFalse(manifest["deploy"])
        self.assertFalse(manifest["commitCreated"])
        self.assertFalse(manifest["m61Started"])
        page = (ROOT / "app" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn("ProductionPhotonicSiteClient", page)
        self.assertNotIn("visual-lab", page)
        self.assertNotIn("promotion-preview", page)


if __name__ == "__main__":
    unittest.main()
