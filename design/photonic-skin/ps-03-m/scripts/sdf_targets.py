"""PS-03.M matter substrate: analytic SDF definitions of the three test states.

The internal matter of the mimic is represented as a signed distance field.
Each end state (Sphere Master / Open Book / Gamepad + Queen) is a composite
SDF; transitions blend two state SDFs plus an art-directed bridge term that
controls the split/merge moment.  Everything is vectorised numpy: functions
accept points of shape (n, 3) and return distances of shape (n,).

All shapes are authored around unit scale and then uniformly scaled by the
volume-normalisation step in the build pipeline, so the numbers below only
fix proportions, not the final mass.
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# Primitive SDFs (exact or bounded conservative approximations).
# ---------------------------------------------------------------------------


def sd_sphere(p: np.ndarray, radius: float, center=(0.0, 0.0, 0.0)) -> np.ndarray:
    return np.linalg.norm(p - np.asarray(center), axis=1) - radius


def sd_round_box(p: np.ndarray, half, radius: float, center=(0.0, 0.0, 0.0)) -> np.ndarray:
    q = np.abs(p - np.asarray(center)) - (np.asarray(half) - radius)
    outside = np.linalg.norm(np.maximum(q, 0.0), axis=1)
    inside = np.minimum(np.max(q, axis=1), 0.0)
    return outside + inside - radius


def sd_capsule(p: np.ndarray, a, b, radius) -> np.ndarray:
    """Capsule between points a and b; radius may be scalar or per-point."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    pa = p - a
    ba = b - a
    h = np.clip(pa @ ba / float(ba @ ba), 0.0, 1.0)
    return np.linalg.norm(pa - np.outer(h, ba), axis=1) - radius


def sd_ellipsoid(p: np.ndarray, radii, center=(0.0, 0.0, 0.0)) -> np.ndarray:
    """Bounded approximation (Inigo Quilez); adequate for marching cubes."""
    q = (p - np.asarray(center)) / np.asarray(radii)
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / np.asarray(radii), axis=1)
    return np.where(k1 > 1e-12, k0 * (k0 - 1.0) / np.maximum(k1, 1e-12), -np.min(radii))


def smin(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    """Polynomial smooth minimum (smooth union of two SDFs)."""
    if k <= 0.0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    """Smooth intersection/subtraction helper."""
    return -smin(-a, -b, k)


def rot_y(p: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    q = p.copy()
    q[:, 0] = c * p[:, 0] + s * p[:, 2]
    q[:, 2] = -s * p[:, 0] + c * p[:, 2]
    return q


def rot_x(p: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    q = p.copy()
    q[:, 1] = c * p[:, 1] - s * p[:, 2]
    q[:, 2] = s * p[:, 1] + c * p[:, 2]
    return q


# ---------------------------------------------------------------------------
# State A — Sphere Master.
# ---------------------------------------------------------------------------

SPHERE_RADIUS = 1.0


def sd_state_sphere(p: np.ndarray) -> np.ndarray:
    return sd_sphere(p, SPHERE_RADIUS)


# ---------------------------------------------------------------------------
# State B — Open Book (single watertight volume: two thick wings + spine).
# ---------------------------------------------------------------------------

BOOK_WING_HALF = (0.62, 0.92, 0.165)   # across page, along spine, thickness
BOOK_WING_TILT = np.radians(24.0)      # opening angle of each wing
BOOK_WING_OFFSET = 0.565               # wing centre distance from spine line
BOOK_SPINE_RADIUS = 0.20
BOOK_SMOOTH = 0.05
BOOK_PAGE_DROP = 0.045                 # subtle top-page relief


def sd_state_book(p: np.ndarray) -> np.ndarray:
    """Open book lying flat, spine along Y, pages opening upward in +Z."""
    # Left wing: shifted +x then tilted so the outer edge lifts.
    left = rot_y(p, -BOOK_WING_TILT)
    left[:, 0] += BOOK_WING_OFFSET
    d_left = sd_round_box(left, BOOK_WING_HALF, 0.05)

    right = rot_y(p, BOOK_WING_TILT)
    right[:, 0] -= BOOK_WING_OFFSET
    d_right = sd_round_box(right, BOOK_WING_HALF, 0.05)

    # Spine: horizontal capsule along Y at the hinge, slightly below page tops.
    d_spine = sd_capsule(
        p,
        (0.0, -BOOK_WING_HALF[1] * 0.94, -0.10),
        (0.0, BOOK_WING_HALF[1] * 0.94, -0.10),
        BOOK_SPINE_RADIUS,
    )

    body = smin(smin(d_left, d_right, BOOK_SMOOTH), d_spine, BOOK_SMOOTH * 1.6)

    # Central valley: a soft groove above the spine so the fold reads.
    groove = sd_capsule(
        p,
        (0.0, -BOOK_WING_HALF[1] * 1.02, 0.16),
        (0.0, BOOK_WING_HALF[1] * 1.02, 0.16),
        0.135,
    )
    body = smax(body, -groove, 0.04)

    # Page-block relief: shave a whisper off the top faces near outer edges.
    lift = np.exp(-((np.abs(p[:, 0]) - 1.05) ** 2) * 18.0)
    return body + BOOK_PAGE_DROP * 0.18 * lift


# ---------------------------------------------------------------------------
# State C — Gamepad + Queen (two spatially separated components).
# ---------------------------------------------------------------------------

GAMEPAD_CENTER = np.array([-0.62, 0.0, -0.28])
QUEEN_CENTER = np.array([0.92, 0.0, -0.10])
QUEEN_HEIGHT = 2.0
QUEEN_RADIAL_SCALE = 1.22


def sd_gamepad(p: np.ndarray) -> np.ndarray:
    """Stylised gamepad: wide rounded body + two down-swept grip horns."""
    q = p - GAMEPAD_CENTER
    q = rot_y(q, np.radians(9.0))

    body = sd_round_box(q, (0.64, 0.37, 0.20), 0.11)

    grip_l = sd_capsule(
        q, (-0.48, 0.16, 0.0), (-0.68, -0.54, -0.06), 0.205
    )
    grip_r = sd_capsule(
        q, (0.48, 0.16, 0.0), (0.68, -0.54, -0.06), 0.205
    )
    pad = smin(body, smin(grip_l, grip_r, 0.02), 0.075)

    # Two shallow thumb-stick domes influencing the top silhouette.
    dome_l = sd_sphere(q, 0.115, (-0.25, 0.11, 0.22))
    dome_r = sd_sphere(q, 0.115, (0.25, 0.11, 0.22))
    pad = smin(pad, np.minimum(dome_l, dome_r), 0.05)

    # Front waist notch between the grips so the U-shape reads from top.
    notch = sd_capsule(q, (0.0, -0.66, 0.1), (0.0, -0.34, -0.02), 0.21)
    return smax(pad, -notch, 0.05)


QUEEN_PROFILE = np.array(
    # (z along height 0..1, radius) — chess queen profile of revolution.
    [
        (0.000, 0.340),   # base plinth
        (0.060, 0.330),
        (0.110, 0.240),   # base cove
        (0.180, 0.190),
        (0.320, 0.130),   # lower stem
        (0.500, 0.100),   # waist
        (0.610, 0.125),
        (0.660, 0.175),   # collar knop
        (0.690, 0.130),
        (0.760, 0.140),   # crown cup lower
        (0.860, 0.210),   # crown rim (widest of the head)
        (0.905, 0.165),
        (0.940, 0.080),   # above coronet
        (0.975, 0.062),   # orb
        (1.000, 0.000),
    ],
    dtype=np.float64,
)
QUEEN_CROWN_POINTS = 7
QUEEN_CROWN_DEPTH = 0.070
QUEEN_CROWN_Z = (0.815, 0.905)  # normalised band where coronet notches live


def _queen_radius(z01: np.ndarray, theta: np.ndarray) -> np.ndarray:
    radius = np.interp(z01, QUEEN_PROFILE[:, 0], QUEEN_PROFILE[:, 1]) * QUEEN_RADIAL_SCALE
    # Coronet: periodic notches around the crown rim (this is what makes it
    # a queen rather than a pawn) — smooth angular scallops.
    band = np.clip(
        (z01 - QUEEN_CROWN_Z[0]) / (QUEEN_CROWN_Z[1] - QUEEN_CROWN_Z[0]), 0.0, 1.0
    )
    band = band * band * (3.0 - 2.0 * band)
    band *= np.clip(1.0 - (z01 - QUEEN_CROWN_Z[1]) * 14.0, 0.0, 1.0)
    scallop = 0.5 - 0.5 * np.cos(theta * QUEEN_CROWN_POINTS)
    return radius - QUEEN_CROWN_DEPTH * band * scallop


def sd_queen(p: np.ndarray) -> np.ndarray:
    """Chess queen as a bounded surface-of-revolution field with coronet."""
    q = p - QUEEN_CENTER
    z01 = np.clip((q[:, 2] + QUEEN_HEIGHT * 0.5) / QUEEN_HEIGHT, 0.0, 1.0)
    theta = np.arctan2(q[:, 1], q[:, 0])
    radial = np.hypot(q[:, 0], q[:, 1]) - _queen_radius(z01, theta)
    # Cap top and bottom so the field is a closed volume.
    axial = np.maximum(
        -QUEEN_HEIGHT * 0.5 - q[:, 2], q[:, 2] - QUEEN_HEIGHT * 0.5
    )
    return np.maximum(radial, axial)


def sd_state_game(p: np.ndarray) -> np.ndarray:
    """Exactly two separated components: hard min, no smoothing bridge."""
    return np.minimum(sd_gamepad(p), sd_queen(p))


# Bridge anchors used by the transition solver for controlled split/merge.
GAME_BRIDGE_A = GAMEPAD_CENTER + np.array([0.42, 0.0, 0.05])
GAME_BRIDGE_B = QUEEN_CENTER + np.array([-0.28, 0.0, -0.35])

# Queen growth axis: keeps the queen connected to its base while the thin
# stem materialises during transitions (prevents a floating-crown island).
QUEEN_AXIS_BASE = QUEEN_CENTER + np.array([0.0, 0.0, -QUEEN_HEIGHT * 0.48])
QUEEN_AXIS_TOP = QUEEN_CENTER + np.array([0.0, 0.0, QUEEN_HEIGHT * 0.46])


STATE_SDFS = {
    "sphere": sd_state_sphere,
    "book": sd_state_book,
    "game": sd_state_game,
}

STATE_ORDER = ("sphere", "book", "game")
