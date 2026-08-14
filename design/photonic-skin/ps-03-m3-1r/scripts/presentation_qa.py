"""Projection helpers bound to the PS-03.M3.1R endpoint library."""

from __future__ import annotations

import numpy as np

from m31r_core import (
    M31R_DIR,
    PUBLIC_M31R,
    STATE_DTYPE,
    analyze_projection,
    projected_splats,
    read_json,
    render_projection,
)


PUBLIC_DIR = PUBLIC_M31R
MANIFEST_PATH = M31R_DIR / "exports" / "ps03m31r-manifest.json"


def load_records(entry: dict) -> np.ndarray:
    return np.fromfile(PUBLIC_DIR / entry["bufferPath"], dtype=STATE_DTYPE)


__all__ = [
    "M31R_DIR",
    "PUBLIC_DIR",
    "MANIFEST_PATH",
    "analyze_projection",
    "load_records",
    "projected_splats",
    "read_json",
    "render_projection",
]
