"""PS-04.M5.3.R1 python guards."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-3-r1"
M53 = ROOT / "design" / "photonic-skin" / "ps-04-m5-3"
OWNER = "4f7d67fb8ee37a0fb1fb024a8e68b6bf39486db414b6016edbc7fbcb41ba018e"
COMBO_30 = "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb"
COMBO_30_R1 = "f54ed82e28cf82f55ca41c45d6c97dd315fb9fcd6c4945d90a70373af25b92f5"
FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Ps04M53R1(unittest.TestCase):
    def test_owner_spec(self) -> None:
        self.assertEqual(sha(STAGE / "references" / "clapperboard-anatomy-spec.md"), OWNER)
        self.assertEqual(sha(ROOT / "docs" / "ps-04-m5-3-r1-clapperboard-anatomy-spec.md"), OWNER)

    def test_original_unchanged(self) -> None:
        self.assertEqual(sha(M53 / "variants" / "combo-30" / "single-video.state.bin"), COMBO_30)
        self.assertEqual(sha(ROOT / "public" / "photonic-skin" / "ps-04-m5-3" / "variants" / "combo-30" / "single-video.state.bin"), COMBO_30)
        self.assertEqual(sha(ROOT / "public" / "photonic-skin" / "ps-03-m3-1r" / "states" / "single-video.state.bin"), FROZEN_VIDEO)

    def test_r1_hash_and_gates(self) -> None:
        self.assertEqual(sha(STAGE / "variants" / "combo-30-r1" / "single-video.state.bin"), COMBO_30_R1)
        self.assertEqual(sha(ROOT / "public" / "photonic-skin" / "ps-04-m5-3-r1" / "variants" / "combo-30-r1" / "single-video.state.bin"), COMBO_30_R1)
        gates = json.loads((STAGE / "reports" / "geometry-gates.json").read_text(encoding="utf-8"))
        proof = json.loads((STAGE / "reports" / "selective-edit-proof.json").read_text(encoding="utf-8"))
        pivot = json.loads((STAGE / "reports" / "pivot-proof.json").read_text(encoding="utf-8"))
        self.assertTrue(gates["pass"])
        self.assertTrue(proof["nonClapperByteIdentity"])
        self.assertEqual(pivot["variants"]["combo-30-r1"]["openAngleAbs"], 30.0)
        self.assertLessEqual(pivot["variants"]["combo-30-r1"]["pivotError"], 1e-4)

    def test_two_runs(self) -> None:
        path = STAGE / "reports" / "two-run-identity.json"
        self.assertTrue(path.exists(), "two-run-identity.json must exist")
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertTrue(payload["identical"])
        self.assertEqual(payload["combo30r1"], COMBO_30_R1)


if __name__ == "__main__":
    unittest.main()
