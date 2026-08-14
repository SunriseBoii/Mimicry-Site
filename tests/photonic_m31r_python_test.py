"""Python contract tests for PS-03.M3.1R."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FINAL = ROOT / "public" / "photonic-skin" / "ps-03-m3-1r"
OLD = ROOT / "public" / "photonic-skin" / "ps-03-m3-1"
DESIGN = ROOT / "design" / "photonic-skin" / "ps-03-m3-1r"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


class M31RContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.manifest = read(FINAL / "manifest.json")
        cls.baseline = read(OLD / "manifest.json")
        cls.mapping = read(FINAL / "state-mapping.json")

    def test_version_and_inventory(self) -> None:
        self.assertEqual(self.manifest["stage"], "PS-03.M3.1R")
        self.assertEqual(self.manifest["stateVersion"], "3.1.1")
        self.assertEqual(len(self.manifest["states"]), 154)
        self.assertEqual(sum("event" in item["competencyIds"] for item in self.manifest["states"]), 83)

    def test_hash_and_byte_contract(self) -> None:
        old_by_id = {item["stateId"]: item for item in self.baseline["states"]}
        event_changed = 0
        non_event_identical = 0
        for entry in self.manifest["states"]:
            old = old_by_id[entry["stateId"]]
            if "event" in entry["competencyIds"]:
                event_changed += entry["contentHash"] != old["contentHash"]
            else:
                old_bytes = (OLD / entry["bufferPath"]).read_bytes()
                new_bytes = (FINAL / entry["bufferPath"]).read_bytes()
                non_event_identical += old_bytes == new_bytes
        self.assertEqual(event_changed, 83)
        self.assertEqual(non_event_identical, 71)

    def test_candidate_and_full_qa(self) -> None:
        candidates = read(DESIGN / "reports" / "ps03m31r-event-candidate-evaluation.json")
        self.assertEqual(candidates["selectedYawDegrees"], 18.0)
        self.assertTrue(next(item for item in candidates["candidates"] if item["yawDegrees"] == 18.0)["machinePass"])
        qa = read(DESIGN / "reports" / "ps03m31r-qa-summary.json")
        self.assertTrue(qa["machinePass"])
        self.assertEqual(qa["failureCount"], 0)
        self.assertEqual(qa["rigidInvariantFailures"], 0)

    def test_identity_origin_is_preserved(self) -> None:
        old = (OLD / "runtime" / "ps03m31-identity-origins.f32.bin").read_bytes()
        new = (FINAL / "runtime" / "ps03m31r-identity-origins.f32.bin").read_bytes()
        self.assertEqual(old, new)


if __name__ == "__main__":
    unittest.main()
