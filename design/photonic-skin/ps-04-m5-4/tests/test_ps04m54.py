"""PS-04.M5.4 framing analysis guards."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-4"
SELECTED_VIDEO = "2d6957815b6f58f87f1709e0378313cba271530b8fb0e02282b556780448a873"
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"
FROZEN_VIDEO = "3e78623ebbe98b0432ae527c207a2f31f70b418e8753df6fe18aa50a2230d97b"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def smooth5(t: float) -> float:
    t = min(1.0, max(0.0, t))
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def c2_window(value: float, start: float, end: float) -> float:
    span = end - start
    if span <= 0:
        return 1.0 if value >= end else 0.0
    return smooth5((value - start) / span)


class Ps04M54(unittest.TestCase):
    def test_selected_hashes_unchanged(self) -> None:
        self.assertEqual(sha(ROOT / "design" / "photonic-skin" / "ps-04-m5-3-r1" / "variants" / "combo-40-r1" / "single-video.state.bin"), SELECTED_VIDEO)
        self.assertEqual(sha(ROOT / "public" / "photonic-skin" / "ps-04-m5-3-r1" / "variants" / "combo-40-r1" / "single-video.state.bin"), SELECTED_VIDEO)
        self.assertEqual(sha(ROOT / "public" / "photonic-skin" / "ps-03-m3-1r" / "states" / "single-video.state.bin"), FROZEN_VIDEO)
        self.assertEqual(sha(ROOT / "design" / "photonic-skin" / "ps-04-m5-2-r2" / "variants" / "a-r2" / "single-event.state.bin"), EVENT_A_R2)

    def test_no_new_geometry_buffers(self) -> None:
        public = ROOT / "public" / "photonic-skin" / "ps-04-m5-4"
        bins = list(public.rglob("*.bin")) if public.exists() else []
        self.assertEqual(bins, [])

    def test_c2_framing_mix_has_no_step(self) -> None:
        source, target = 1.0, 1.18
        previous = source
        deltas = []
        for i in range(21):
            g = i / 20
            current = source + (target - source) * c2_window(g, 0, 1)
            deltas.append(current - previous)
            previous = current
        self.assertLess(max(abs(delta) for delta in deltas[1:]), 0.04)
        self.assertGreater(min(deltas[1:8]), -1e-9)

    def test_candidate_matrix_and_mapping(self) -> None:
        manifest = json.loads((STAGE / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["balancedReview"]["aboutZoom"], 118)
        self.assertEqual(manifest["balancedReview"]["merchZoom"], 108)
        self.assertEqual(manifest["balancedReview"]["videoZoom"], 108)
        self.assertEqual(manifest["selectedProfile"], "OWNER_SELECTED_124_111_111")
        self.assertEqual(manifest["selectedFraming"]["aboutRequestedZoom"], 1.24)
        self.assertEqual(manifest["selectedFraming"]["aboutMobileCap"], 1.18)
        self.assertEqual(manifest["selectedFraming"]["merchRequestedZoom"], 1.11)
        self.assertEqual(manifest["selectedFraming"]["merchMobileCap"], 1.08)
        self.assertEqual(manifest["selectedFraming"]["videoRequestedZoom"], 1.11)
        self.assertEqual(manifest["selectedFraming"]["videoMobileCap"], 1.08)
        self.assertFalse(manifest["m55Started"])
        self.assertFalse(manifest["productionApproval"])
        review = (STAGE / "reports" / "human-review.md").read_text(encoding="utf-8")
        self.assertIn("OWNER_SELECTED_124_111_111", review)
        self.assertIn("m55Started = false", review)
        self.assertEqual(manifest["targets"]["about"]["nodeId"], "02")
        self.assertEqual(manifest["targets"]["merch"]["nodeId"], "05.7")
        self.assertEqual(manifest["targets"]["video"]["nodeId"], "05.5")
        mapping = json.loads((STAGE / "reports" / "screen-mapping-proof.json").read_text(encoding="utf-8"))
        self.assertTrue(mapping["aboutIsExactNode02"])
        self.assertTrue(mapping["brandWideFamilyNotFramed"])

    def test_orthographic_operator_is_frustum_zoom(self) -> None:
        framing = (ROOT / "app" / "visual-lab" / "photonic-skin-ps04-m5" / "framing.ts").read_text(encoding="utf-8")
        self.assertIn("PerspectiveCamera", framing)
        self.assertIn("frustum", framing.lower())
        scene = (ROOT / "app" / "visual-lab" / "photonic-skin-ps04-m5" / "PS04M5Scene.tsx").read_text(encoding="utf-8")
        self.assertIn("liveCamera.zoom = zoom", scene)
        self.assertIn("siteFitScale", scene)
        self.assertNotIn("OrthographicCamera", scene)


if __name__ == "__main__":
    unittest.main()
