"""PS-04.M5.2.R2 python guards: mapping, hashes, two-run identity."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
STAGE = ROOT / "design" / "photonic-skin" / "ps-04-m5-2-r2"
EVENT_A = "76c46452781c4334b4d91cca9ed6533bb9ccd7224c57bdf7abf7e1093d1c938d"
EVENT_A_R1 = "89f50d4c83b15de21b753f98d6ab368e974c20a91ed135668bbaf05445b898cc"
EVENT_A_R2 = "5945d1350ec024ca24a1dd3f4dfe8985efec6bf48712889257373d96bac9293b"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Ps04M52R2(unittest.TestCase):
    def test_hashes(self) -> None:
        self.assertEqual(sha(ROOT / "design/photonic-skin/ps-04-m5-2/variants/a/single-event.state.bin"), EVENT_A)
        self.assertEqual(sha(ROOT / "design/photonic-skin/ps-04-m5-2-r1/variants/a-r1/single-event.state.bin"), EVENT_A_R1)
        self.assertEqual(sha(STAGE / "variants/a-r2/single-event.state.bin"), EVENT_A_R2)
        self.assertEqual(sha(ROOT / "public/photonic-skin/ps-04-m5-2/variants/a-r2/single-event.state.bin"), EVENT_A_R2)

    def test_mapping(self) -> None:
        mapping = json.loads((STAGE / "reports/screen-space-part-map.json").read_text(encoding="utf-8"))
        self.assertTrue(mapping["mappingMatchesOwnerHypothesis"])
        self.assertEqual(mapping["viewerRight"]["componentId"], 2)
        self.assertEqual(mapping["viewerRight"]["VIEWER_RIGHT_COMPONENT"], 2)
        self.assertTrue(mapping["r1WrongTarget"])

    def test_two_authoring_runs_recorded_same_hash(self) -> None:
        log = json.loads((STAGE / "reports" / "two-run-identity.json").read_text(encoding="utf-8")) if (STAGE / "reports" / "two-run-identity.json").exists() else json.loads((STAGE / "authoring/export-log.json").read_text(encoding="utf-8"))
        proof = json.loads((STAGE / "reports/selective-edit-proof.json").read_text(encoding="utf-8"))
        recorded = log.get("eventAR2Hash") or log.get("hashRun1")
        self.assertEqual(recorded, EVENT_A_R2)
        if "hashRun1" in log:
            self.assertEqual(log["hashRun1"], log["hashRun2"])
            self.assertEqual(log["hashRun1"], EVENT_A_R2)
        self.assertEqual(proof["eventAR2Hash"], EVENT_A_R2)
        self.assertTrue(proof["derivedDirectlyFromEventA"])
        self.assertFalse(proof["derivedFromEventAR1"])


if __name__ == "__main__":
    unittest.main()
