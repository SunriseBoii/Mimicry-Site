"""Focused unit tests for the isolated PS-03.M4 Python core."""

from __future__ import annotations

import ast
import json
from pathlib import Path
import sys
import unittest

import numpy as np


M4_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = M4_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import contracts  # noqa: E402
from evaluator import c2_bump, evaluate, evaluate_time_grid  # noqa: E402
from m3_adapter import (  # noqa: E402
    load_m3_state,
    snapshot_descriptor,
    snapshot_entry,
    snapshot_from_evaluation,
    validate_m3_baseline,
)
from transition_compiler_v2 import (  # noqa: E402
    compile_transition,
    decode_program,
    encode_program,
)


def request(source: str | None, target: str, *, count: int = 512, seed: int = 17) -> dict:
    value = {
        "schemaVersion": "1.0.0",
        "targetStateId": target,
        "identitySpaceVersion": contracts.IDENTITY_SPACE_VERSION,
        "motionProfileId": "directed-plastic-release",
        "triggerMode": "qa",
        "viewportProfile": "desktop",
        "directionIntent": "auto",
        "deterministicSeed": seed,
        "probeIdentityCount": count,
    }
    if source is not None:
        value["sourceStateId"] = source
    return value


class CoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.profile = contracts.load_motion_profile()
        cls.source_entry, cls.source = load_m3_state("master-neutral")
        cls.target_entry, cls.target = load_m3_state("single-content")

    def compile_probe(self):
        return compile_transition(
            request(self.source_entry["stateId"], self.target_entry["stateId"]),
            self.source_entry,
            self.source,
            self.target_entry,
            self.target,
            self.profile,
        )

    def test_json_contracts_and_profile(self) -> None:
        expected = {
            "motion-profile.schema.json",
            "transition-request.schema.json",
            "transition-program.schema.json",
        }
        self.assertEqual(expected, {path.name for path in contracts.SCHEMA_DIR.glob("*.json")})
        for path in contracts.SCHEMA_DIR.glob("*.json"):
            schema = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(schema["type"], "object")
            self.assertTrue(schema["required"])
        self.assertEqual([], contracts.validate_motion_profile(self.profile))
        self.assertEqual(
            ("route", "scroll", "preview", "qa"),
            tuple(self.profile["triggerMode"]["supported"]),
        )
        self.assertFalse(self.profile["provenance"]["targetSpecificBranches"])
        self.assertFalse(self.profile["routeFieldPolicy"]["pairSpecificOverrides"])

    def test_frozen_m3_guard_and_layout(self) -> None:
        self.assertTrue(validate_m3_baseline()["valid"])
        self.assertEqual(40, contracts.STATE_DTYPE.itemsize)
        self.assertEqual(64, contracts.GROUP_TRACK_DTYPE.itemsize)
        self.assertEqual(32, contracts.PER_ID_DTYPE.itemsize)
        group_offsets = {
            name: contracts.GROUP_TRACK_DTYPE.fields[name][1]
            for name in contracts.GROUP_TRACK_DTYPE.names
        }
        per_offsets = {
            name: contracts.PER_ID_DTYPE.fields[name][1]
            for name in contracts.PER_ID_DTYPE.names
        }
        self.assertEqual(0, group_offsets["sourceCenter"])
        self.assertEqual(24, group_offsets["routeControl"])
        self.assertEqual(54, group_offsets["sourceMacro"])
        self.assertEqual(60, group_offsets["memberCount"])
        self.assertEqual(12, per_offsets["residual"])
        self.assertEqual(26, per_offsets["groupIndex"])
        self.assertEqual(28, per_offsets["flags"])

    def test_deterministic_compile_encode_decode(self) -> None:
        first = self.compile_probe()
        second = self.compile_probe()
        self.assertEqual(first.hashes, second.hashes)
        self.assertEqual(first.group_tracks.tobytes(), second.group_tracks.tobytes())
        self.assertEqual(first.per_id.tobytes(), second.per_id.tobytes())
        self.assertEqual(512, first.header["identityCount"])
        self.assertEqual("auto", request("a", "b")["directionIntent"])
        self.assertAlmostEqual(1.0, np.linalg.norm(first.header["directionAxis"]), places=12)
        encoded = encode_program(first)
        decoded = decode_program(encoded)
        self.assertEqual(first.hashes, decoded.hashes)
        self.assertEqual(first.group_tracks.tobytes(), decoded.group_tracks.tobytes())
        self.assertEqual(first.per_id.tobytes(), decoded.per_id.tobytes())
        tampered = dict(encoded)
        payload = bytearray(encoded["perId"])
        payload[0] ^= 1
        tampered["perId"] = bytes(payload)
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            decode_program(tampered)

    def test_endpoints_channels_and_scrub_determinism(self) -> None:
        program = self.compile_probe()
        start = evaluate(program, self.source, self.target, 0.0)
        middle_a = evaluate(program, self.source, self.target, 0.5)
        evaluate(program, self.source, self.target, 0.91)
        middle_b = evaluate(program, self.source, self.target, 0.5)
        end = evaluate(program, self.source, self.target, 1.0)
        np.testing.assert_array_equal(start["position"], self.source["position"][:512])
        np.testing.assert_array_equal(end["position"], self.target["position"][:512])
        np.testing.assert_array_equal(start["scale"], self.source["scale"][:512])
        np.testing.assert_array_equal(end["scale"], self.target["scale"][:512])
        np.testing.assert_array_equal(middle_a["position"], middle_b["position"])
        self.assertTrue(np.isfinite(middle_a["velocity"]).all())
        self.assertLess(np.max(np.abs(np.linalg.norm(middle_a["orientation"], axis=1) - 1.0)), 2e-12)
        self.assertLess(np.max(np.abs(np.linalg.norm(middle_a["normal"], axis=1) - 1.0)), 2e-12)
        np.testing.assert_allclose(middle_a["role"].sum(axis=1), 1.0, atol=1e-12)
        self.assertEqual((512, 3), middle_a["role"].shape)
        self.assertTrue(np.all(middle_a["scale"] > 0.0))

    def test_batched_time_grid_matches_scalar_geometry_channels(self) -> None:
        program = self.compile_probe()
        times = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
        batch = evaluate_time_grid(program, self.source, self.target, times)
        self.assertEqual((5, 512, 3), batch["position"].shape)
        self.assertEqual((5, 512, 4), batch["orientation"].shape)
        for index, value in enumerate(times):
            scalar = evaluate(program, self.source, self.target, float(value))
            np.testing.assert_allclose(batch["position"][index], scalar["position"], atol=3e-16)
            np.testing.assert_allclose(batch["orientation"][index], scalar["orientation"], atol=3e-16)
            np.testing.assert_allclose(batch["scale"][index], scalar["scale"], atol=3e-16)
            np.testing.assert_allclose(batch["role"][index], scalar["role"], atol=3e-16)
        np.testing.assert_array_equal(batch["velocity"][0], np.zeros((512, 3)))
        np.testing.assert_array_equal(batch["velocity"][-1], np.zeros((512, 3)))

    def test_reduced_and_self_are_exact(self) -> None:
        program = self.compile_probe()
        reduced = evaluate(program, self.source, self.target, 0.001, reduced=True)
        np.testing.assert_array_equal(reduced["position"], self.target["position"][:512])
        np.testing.assert_array_equal(reduced["velocity"], np.zeros((512, 3)))

        self_request = request(self.source_entry["stateId"], self.source_entry["stateId"])
        no_op = compile_transition(
            self_request,
            self.source_entry,
            self.source,
            self.source_entry,
            self.source,
            self.profile,
        )
        self.assertTrue(no_op.header["isNoOp"])
        self.assertEqual(0, len(no_op.group_tracks))
        self.assertEqual(0, len(no_op.per_id))
        for progress in (0.0, 0.25, 0.5, 0.75, 1.0):
            sampled = evaluate(no_op, self.source, self.source, progress)
            np.testing.assert_array_equal(sampled["position"], self.source["position"][:512])
            np.testing.assert_array_equal(sampled["velocity"], np.zeros((512, 3)))

    def test_retarget_snapshot_preserves_position_velocity_pose_and_roles(self) -> None:
        first = self.compile_probe()
        for index, interruption in enumerate((0.25, 0.5, 0.75)):
            current = evaluate(first, self.source, self.target, interruption)
            snapshot = snapshot_from_evaluation(current, self.source[:512])
            self.assertEqual((512, 3), snapshot["role"].shape)
            np.testing.assert_array_equal(snapshot["role"], current["role"])
            descriptor = snapshot_descriptor(
                snapshot,
                source_program_hash=first.hashes["contentSha256"],
                captured_progress=interruption,
                generation=index + 1,
            )
            source_entry = snapshot_entry(snapshot)
            retarget_request = request(None, self.source_entry["stateId"], seed=90 + index)
            retarget_request["sourceSnapshot"] = descriptor
            second = compile_transition(
                retarget_request,
                source_entry,
                snapshot,
                self.source_entry,
                self.source,
                self.profile,
            )
            retarget_start = evaluate(second, snapshot, self.source, 0.0, snapshot=snapshot)
            np.testing.assert_allclose(retarget_start["position"], current["position"], atol=2e-15)
            np.testing.assert_allclose(retarget_start["velocity"], current["velocity"], atol=2e-15)
            np.testing.assert_allclose(retarget_start["orientation"], current["orientation"], atol=2e-15)
            np.testing.assert_allclose(retarget_start["scale"], current["scale"], atol=2e-15)
            np.testing.assert_allclose(retarget_start["role"], current["role"], atol=2e-15)
            np.testing.assert_allclose(
                retarget_start["actorPose"]["position"], current["actorPose"]["position"], atol=2e-15
            )
            np.testing.assert_allclose(
                retarget_start["actorPose"]["orientation"], current["actorPose"]["orientation"], atol=2e-15
            )

    def test_bridge_ids_are_shell_changed_and_unprotected(self) -> None:
        count = 32
        source = np.zeros(count, dtype=contracts.STATE_DTYPE)
        target = np.zeros(count, dtype=contracts.STATE_DTYPE)
        axis = np.linspace(-1.0, 1.0, count)
        source["position"][:, 0] = axis
        target["position"][:, 0] = axis
        target["position"][:, 1] = np.where(np.arange(count) % 2, 0.5, -0.5)
        source["normal"][:, 2] = 32767
        target["normal"][:, 2] = 32767
        source["orientation"][:, 3] = 32767
        target["orientation"][:, 3] = 32767
        source["scale"] = 1.0
        target["scale"] = 1.0
        target["shell"] = 1
        target["status"][-8:] = contracts.STATUS_RESERVE
        target["scale"][-8:] = 0.25
        source["flags"][:4] = contracts.STATE_FLAG_FEATURE | contracts.STATE_FLAG_SILHOUETTE
        source_entry = {
            "stateId": "generic-source",
            "contentHash": contracts.sha256_bytes(source.tobytes()),
            "shellCount": 1,
        }
        target_entry = {
            "stateId": "generic-target",
            "contentHash": contracts.sha256_bytes(target.tobytes()),
            "shellCount": 2,
        }
        transition_request = request("generic-source", "generic-target", count=count)
        program = compile_transition(
            transition_request, source_entry, source, target_entry, target, self.profile
        )
        bridge = (program.per_id["flags"] & contracts.PER_ID_FLAG_BRIDGE) != 0
        protected = (source["flags"] & (contracts.STATE_FLAG_FEATURE | contracts.STATE_FLAG_SILHOUETTE)) != 0
        self.assertGreater(np.sum(bridge), 0)
        self.assertFalse(np.any(bridge & protected))
        self.assertTrue(np.all(source["shell"][bridge] != target["shell"][bridge]))
        sampled = evaluate(program, source, target, 0.5)
        self.assertGreater(np.sum(sampled["bridge"] > 0.0), 0)
        self.assertTrue(np.isfinite(sampled["position"]).all())
        saved_flags = program.per_id["flags"].copy()
        program.per_id["flags"] &= np.uint16(0xFFFF ^ contracts.PER_ID_FLAG_BRIDGE)
        without_neck = evaluate(program, source, target, 0.5)
        program.per_id["flags"] = saved_flags
        bridge_displacement = np.linalg.norm(
            sampled["position"][bridge] - without_neck["position"][bridge], axis=1
        )
        self.assertGreater(float(np.max(bridge_displacement)), 1e-6)
        np.testing.assert_array_equal(evaluate(program, source, target, 0.0)["position"], source["position"])
        np.testing.assert_array_equal(evaluate(program, source, target, 1.0)["position"], target["position"])
        snapshot = snapshot_from_evaluation(sampled, source)
        descriptor = snapshot_descriptor(snapshot, captured_progress=0.5)
        transient_entry = snapshot_entry(snapshot)
        retarget_request = request(None, "generic-source", count=count, seed=33)
        retarget_request["sourceSnapshot"] = descriptor
        retarget = compile_transition(
            retarget_request,
            transient_entry,
            snapshot,
            source_entry,
            source,
            self.profile,
        )
        retarget_start = evaluate(retarget, snapshot, source, 0.0, snapshot=snapshot)
        np.testing.assert_allclose(retarget_start["role"], sampled["role"], atol=2e-15)
        np.testing.assert_allclose(retarget_start["bridge"], sampled["bridge"], atol=2e-15)

    def test_snapshot_hash_covers_component_and_role_context(self) -> None:
        program = self.compile_probe()
        current = evaluate(program, self.source, self.target, 0.5)
        first = snapshot_from_evaluation(current, self.source[:512])
        changed_component = dict(current)
        changed_component["component"] = current["component"].copy()
        changed_component["component"][0] ^= np.uint8(1)
        second = snapshot_from_evaluation(changed_component, self.source[:512])
        self.assertNotEqual(first["snapshotHash"], second["snapshotHash"])
        changed_role = dict(current)
        changed_role["role"] = current["role"].copy()
        changed_role["role"][0] = [0.0, 0.0, 1.0]
        third = snapshot_from_evaluation(changed_role, self.source[:512])
        self.assertNotEqual(first["snapshotHash"], third["snapshotHash"])

    def test_phase_bump_is_c2_at_boundaries(self) -> None:
        epsilon = 1e-5
        for boundary in (0.2, 0.8):
            samples = np.array(
                [c2_bump(boundary + offset, 0.2, 0.8) for offset in (-2 * epsilon, -epsilon, 0, epsilon, 2 * epsilon)],
                dtype=np.float64,
            )
            first = (samples[3] - samples[1]) / (2 * epsilon)
            second = (samples[3] - 2 * samples[2] + samples[1]) / epsilon**2
            self.assertLess(abs(float(samples[2])), 1e-14)
            self.assertLess(abs(float(first)), 1e-4)
            self.assertLess(abs(float(second)), 0.02)

    def test_no_named_target_or_competency_literals_in_core_ast(self) -> None:
        forbidden = {"content", "design", "event", "games", "video", "digital", "merch"}
        for name in ("contracts.py", "m3_adapter.py", "transition_compiler_v2.py", "evaluator.py"):
            tree = ast.parse((SCRIPTS_DIR / name).read_text(encoding="utf-8"), filename=name)
            literals = {
                node.value
                for node in ast.walk(tree)
                if isinstance(node, ast.Constant) and isinstance(node.value, str)
            }
            self.assertFalse(forbidden & literals, f"forbidden target literal in {name}")


if __name__ == "__main__":
    unittest.main()
