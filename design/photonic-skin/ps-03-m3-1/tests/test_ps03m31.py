from __future__ import annotations

import hashlib
import json
import math
import unittest
from pathlib import Path


M31_DIR = Path(__file__).resolve().parents[1]
DESIGN_DIR = M31_DIR.parent
REPO_DIR = M31_DIR.parents[2]
PUBLIC_DIR = REPO_DIR / "public" / "photonic-skin" / "ps-03-m3-1"
M3_MANIFEST = DESIGN_DIR / "ps-03-m3" / "exports" / "ps03m3-manifest.json"
M4_MANIFEST = DESIGN_DIR / "ps-03-m4" / "exports" / "ps03m4-manifest.json"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class Ps03M31Contracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = read_json(M31_DIR / "exports" / "ps03m31-manifest.json")
        cls.baseline = read_json(M3_MANIFEST)
        cls.m4 = read_json(M4_MANIFEST)
        cls.descriptors = read_json(M31_DIR / "descriptors" / "presentation-descriptors.json")["descriptors"]

    def test_inventory_is_the_frozen_154_state_semantic_library(self) -> None:
        self.assertEqual(self.manifest["stateCount"], 154)
        self.assertEqual(len(self.manifest["states"]), 154)
        self.assertEqual(sum(row["count"] for row in self.manifest["inventory"]), 154)
        self.assertEqual({entry["stateId"] for entry in self.manifest["states"]}, {entry["stateId"] for entry in self.baseline["states"]})

    def test_seven_single_buffers_are_byte_identical(self) -> None:
        old = {entry["stateId"]: entry for entry in self.baseline["states"]}
        singles = [entry for entry in self.manifest["states"] if entry["stateRole"] == "single"]
        self.assertEqual(len(singles), 7)
        for entry in singles:
            self.assertFalse(entry["geometryChangedFromM3"])
            self.assertEqual(entry["contentHash"], old[entry["stateId"]]["contentHash"])

    def test_every_published_buffer_matches_its_hash_and_stride(self) -> None:
        for entry in self.manifest["states"]:
            path = PUBLIC_DIR / entry["bufferPath"]
            payload = path.read_bytes()
            self.assertEqual(len(payload), entry["bufferBytes"])
            self.assertEqual(entry["recordStride"], 40)
            self.assertEqual(hashlib.sha256(payload).hexdigest(), entry["contentHash"])

    def test_multi_states_have_no_master_core(self) -> None:
        multi = [entry for entry in self.manifest["states"] if entry["stateRole"] in {"complex", "brand_wide"}]
        self.assertEqual(len(multi), 146)
        self.assertFalse(any(component["componentId"] == "master-core" for entry in multi for component in entry["componentMap"]))

    def test_descriptor_axes_and_profiles_are_complete(self) -> None:
        self.assertEqual(len(self.descriptors), 7)
        self.assertEqual({entry["competencyId"] for entry in self.descriptors}, {"content", "design", "digital", "event", "games", "merch", "video"})
        for descriptor in self.descriptors:
            up = descriptor["semanticUp"]
            forward = descriptor["semanticForward"]
            self.assertAlmostEqual(math.sqrt(sum(value * value for value in up)), 1.0, places=6)
            self.assertAlmostEqual(math.sqrt(sum(value * value for value in forward)), 1.0, places=6)
            self.assertAlmostEqual(sum(a * b for a, b in zip(up, forward)), 0.0, places=6)
            self.assertEqual(set(descriptor["profileComponents"]), {"desktop", "mobile390", "silhouette180", "silhouette96"})
            self.assertTrue(descriptor["assemblyEmblem"])

    def test_camera_and_presentation_contract_is_fixed(self) -> None:
        contract = self.manifest["presentationContract"]
        self.assertFalse(contract["cameraAnimated"])
        self.assertNotEqual(contract["cameras"]["alternate"], [-value for value in contract["cameras"]["canonical"]])
        self.assertEqual(set(contract["cameras"]), {"canonical", "alternate", "side", "top"})
        for entry in self.manifest["states"]:
            self.assertGreater(entry["presentationFrame"]["scale"], 0)

    def test_machine_and_render_reports_are_complete(self) -> None:
        qa = read_json(M31_DIR / "reports" / "ps03m31-qa-summary.json")
        renders = read_json(M31_DIR / "reports" / "ps03m31-render-inventory.json")
        self.assertTrue(qa["machinePass"])
        self.assertEqual(qa["checkedStateViews"], 1232)
        self.assertEqual(qa["failureCounts"], {})
        self.assertEqual(renders["boardCount"], 18)
        self.assertTrue(renders["focusLeadCoverage"]["allSevenCovered"])
        self.assertFalse(renders["focusLeadCoverage"]["manifestStateAddedForProbe"])

    def test_m3_and_m4_checkpoints_remain_available_and_frozen(self) -> None:
        self.assertEqual(self.manifest["baseline"]["deterministicFingerprint"], self.baseline["deterministicFingerprint"])
        self.assertEqual(self.manifest["frozenM4"], self.m4["frozenM3"])
        self.assertFalse(self.manifest["frozenM4"]["stateBuffersCopiedIntoM4"])


if __name__ == "__main__":
    unittest.main()
