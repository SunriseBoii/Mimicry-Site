"""PS-04.M5.3 python guards: frozen Video, hashes, anatomy, two-run identity."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-3"
FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
COMBO_30 = "4e9f22ae50cb581951decedf2d479ef3670f504ffdc93abb909befda2c7d7cdb"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Ps04M53(unittest.TestCase):
    def test_frozen_video_and_r2(self) -> None:
        self.assertEqual(sha(ROOT / "public/photonic-skin/ps-03-m3-1r/states/single-video.state.bin"), FROZEN_VIDEO)
        self.assertEqual(sha(STAGE / "variants/baseline/single-video.state.bin"), FROZEN_VIDEO)
        self.assertEqual(sha(ROOT / "design/photonic-skin/ps-04-m5-2-r2/variants/a-r2/single-event.state.bin"), EVENT_A_R2)

    def test_combo30_hash(self) -> None:
        self.assertEqual(sha(STAGE / "variants/combo-30/single-video.state.bin"), COMBO_30)
        self.assertEqual(sha(ROOT / "public/photonic-skin/ps-04-m5-3/variants/combo-30/single-video.state.bin"), COMBO_30)

    def test_board_and_bar_are_separate(self) -> None:
        mapping = json.loads((STAGE / "variants/combo-30/component-map.json").read_text(encoding="utf-8"))
        self.assertEqual(mapping["componentIds"][4], "slate-board")
        self.assertEqual(mapping["componentIds"][6], "slate-hinged-bar")
        anatomy = json.loads((STAGE / "reports/anatomy-validation.json").read_text(encoding="utf-8"))
        self.assertTrue(anatomy["pass"])

    def test_two_runs(self) -> None:
        proof = json.loads((STAGE / "reports/two-run-identity.json").read_text(encoding="utf-8"))
        self.assertTrue(proof["identical"])
        self.assertEqual(proof["run1"]["combo-30"], proof["run2"]["combo-30"])
        self.assertEqual(proof["combo30"], COMBO_30)


if __name__ == "__main__":
    unittest.main()
