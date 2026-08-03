"""PS-03.4 D-R3 macro-first associative geometry for the seven SINGLE targets.

The D-R2 failure was architectural: every SINGLE started from one shared
``superellipsoid_point`` field body, semantic features were added as local
ridges/folds, and ``stabilize_shared_extrema`` with fill 0.88-0.99 pulled all
outer proportions back to one soft oblong mass.  At 96 px only that mass
survived.

D-R3 replaces the principle.  Each SINGLE is authored as its own lofted
surface: the 2D macro plan (outline, aspect ratio, mass distribution) is
decided first, then target-specific cross-sections and height fields, then
medium plasticity.  There is no shared donor body and no uniform
normalization back to a common envelope fill.  The canonical envelope
6.8 x 3.6 x 3.2 remains a hard maximum only.

Everything here is a coordinate-only deformation field on the approved ring
topology (160 segments x 52 interior rings + 2 poles = 8322 vertices).
Topology, UV, vertex order and mask membership are never touched.
"""

from __future__ import annotations

import math


TARGET_BBOX = (6.8, 3.6, 3.2)

SINGLE_NAMES = (
    "SINGLE_CONTENT_SEQUENCE",
    "SINGLE_DESIGN_TORSION",
    "SINGLE_EVENT_CONVERGENCE",
    "SINGLE_GAMES_BRANCH",
    "SINGLE_VIDEO_TEMPORAL",
    "SINGLE_DIGITAL_SIGNAL",
    "SINGLE_MERCH_WRAP",
)


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0 if value < edge0 else 1.0
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def gauss(value: float, center: float, width: float) -> float:
    return math.exp(-(((value - center) / width) ** 2))


def bump(value: float, center: float, width: float) -> float:
    """Compactly supported cosine bump: 1 at center, 0 outside +-width."""
    distance = abs(value - center) / width
    if distance >= 1.0:
        return 0.0
    return 0.5 * (1.0 + math.cos(math.pi * distance))


def sspow(value: float, power: float) -> float:
    return math.copysign(abs(value) ** power, value)


def cap_profile(t: float, m: float) -> float:
    """Longitudinal end rounding; m=2 ellipse, high m = blunt end wall."""
    return max(0.0, 1.0 - abs(t) ** m) ** (1.0 / m)


def photonic_zone_field(s: float, phi: float) -> float:
    """Copy of the approved PS-03.2 smooth mask-zone field (read-only)."""
    u = (s + 1.0) * 0.5
    radial = max(0.0, 1.0 - s * s) ** 0.25
    score = radial * (
        0.50 * math.sin(phi)
        + 0.34 * (-math.cos(phi))
        + 0.18 * math.sin(math.pi * u)
        + 0.12 * u
        + 0.055 * math.sin(phi * 3.0 + u * 8.0)
    )
    return smoothstep(-0.18, 0.62, score)


# ---------------------------------------------------------------------------
# Seven target surface architectures.  Each function returns one (x, y, z)
# for the vertex parameter (s, phi) and a variant parameter dict.
# ---------------------------------------------------------------------------


def _frame(s: float, phi: float):
    u = (s + 1.0) * 0.5
    cy = math.cos(phi)
    cz = math.sin(phi)
    at_pole = abs(s) >= 0.999999
    return u, cy, cz, at_pole


def content_folio(s: float, phi: float, p: dict):
    """Editorial Folio: two broad page fields around one central hinge."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    m = p["plan_m_left"] if s < 0.0 else p["plan_m_right"]
    rad = cap_profile(s, m)
    ny = 0.0 if at_pole else cyr

    hinge = p["hinge_u"]
    left = smoothstep(hinge + 0.06, hinge - 0.10, u)
    right = smoothstep(hinge - 0.06, hinge + 0.10, u)
    # Page planes rise from the hinge valley toward their outer edges with
    # deliberately different opening angles.
    span_l = max(1e-6, hinge)
    span_r = max(1e-6, 1.0 - hinge)
    rise_l = clamp((hinge - u) / span_l)
    rise_r = clamp((u - hinge) / span_r)
    top = (
        p["hinge_h"]
        + left * (p["edge_h_left"] - p["hinge_h"]) * (rise_l ** p["page_pow_left"])
        + right * (p["edge_h_right"] - p["hinge_h"]) * (rise_r ** p["page_pow_right"])
    )
    top += p["raise_right"] * right
    # Paper camber across each page keeps the surface tensioned, not planar.
    top += p["curl"] * (1.0 - ny * ny) * (left * rise_l + right * rise_r + 0.35)
    # A shallow hinge shadow line, fading toward the rim so the outer wall
    # never collapses to a paper-thin edge.
    top -= p["valley_extra"] * bump(u, hinge, p["valley_w"]) * (1.0 - 0.55 * abs(ny))
    # Three broad editorial beats on the larger page (medium plasticity).
    top += p["beat"] * left * (
        bump(u, hinge - 0.30, 0.10) + 0.7 * bump(u, hinge - 0.17, 0.08)
    ) * bump(ny, -0.15, 0.9)

    width = p["width"] * (1.0 + p["width_front_bias"] * max(0.0, -ny))
    width *= 1.0 - p["width_hinge_pinch"] * bump(u, hinge, 0.16)

    height = top if cz >= 0.0 else p["base_depth"]
    x_half = p["x_half"] * (1.0 - p["shorten_right"] * smoothstep(hinge, 1.0, u))
    x = x_half * s
    y = width * cyr * rad
    z = height * czr * rad
    # Slight opposing page pitch so the spread reads in the canonical 3/4.
    z += p["pitch"] * ny * (right * rise_r - 0.5 * left * rise_l) * rad
    return x, y, z


def design_palette(s: float, phi: float, p: dict):
    """Forming Palette: low wide slab, side bite, lobe and one lifted corner."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    rad = cap_profile(s, p["plan_m"])
    ny = 0.0 if at_pole else cyr

    base_w = p["width_a"] + (p["width_b"] - p["width_a"]) * u
    if ny >= 0.0:
        width = base_w * (1.0 - p["bite_far"] * bump(u, p["bite_u"], p["bite_w"]))
        width *= 1.0 + p["lobe_far"] * bump(u, p["lobe_u"], p["lobe_w"])
    else:
        width = base_w * (1.0 - p["bite_near"] * bump(u, p["bite_near_u"], p["bite_near_w"]))
        width *= 1.0 + p["lobe_near"] * bump(u, p["lobe_near_u"], p["lobe_near_w"])
    width *= 1.0 - p["entry_pinch"] * bump(u, 0.04, 0.22)

    top = p["top_h"] + p["shelf"] * smoothstep(-0.2, 0.6, ny)
    top -= p["dish"] * bump(u, p["dish_u"], 0.34) * bump(ny, -0.1, 0.62)
    corner = bump(u, p["corner_u"], p["corner_w"]) * bump(ny, p["corner_ny"], p["corner_nw"])
    top += p["corner_lift"] * corner

    height = top if cz >= 0.0 else p["base_depth"]
    x = p["x_half"] * s
    y = width * cyr * rad
    z = height * czr * rad
    # Controlled counter-torsion of the working plane.
    z += p["twist"] * ny * (u - 0.5) * rad * (0.4 + 0.6 * max(0.0, czr))
    y += p["drift"] * (u - 0.5) * rad
    return x, y, z


def event_canopy(s: float, phi: float, p: dict):
    """Gathering Canopy: broad low roof planes converge at one offset apex."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    rad = cap_profile(s, p["plan_m"])
    ny = 0.0 if at_pole else cyr

    width = p["width"]
    for flare_u, flare_ny, flare_amp, flare_w in p["eaves"]:
        if (ny >= 0.0) == (flare_ny >= 0.0):
            width *= 1.0 + flare_amp * bump(u, flare_u, flare_w)

    du = (u - p["apex_u"]) * p["slope_u"]
    dn = (ny - p["apex_ny"]) * p["slope_ny"]
    # Planar tent faces: an anisotropic pyramid field, softened only near the
    # apex so it stays a tensile roof rather than a volcano cone.
    pyramid = max(0.0, 1.0 - abs(du) - abs(dn))
    roofline = pyramid ** p["roof_pow"]
    rim = p["rim_a"] + (p["rim_b"] - p["rim_a"]) * u
    top = max(p.get("top_min", 0.3), rim + (p["apex_h"] - rim) * roofline)
    if p.get("shoulder_h", 0.0) > 0.0:
        top = max(
            top,
            rim
            + (p["shoulder_h"] - rim)
            * max(0.0, 1.0 - abs((u - p["shoulder_u"]) * 2.4) - abs((ny - p["shoulder_ny"]) * 1.8)) ** 1.2,
        )

    height = top if cz >= 0.0 else p["base_depth"]
    x = p["x_half"] * s
    y = width * cyr * rad
    z = height * czr * rad
    z -= p["eave_drop"] * max(0.0, czr) * smoothstep(0.5, 0.9, abs(ny)) * rad * min(
        1.0, top / max(1e-6, p.get("top_min", 0.3) + 0.25)
    )
    return x, y, z


def _plan_lobes(x: float, y: float, p: dict):
    """True radial plan articulation: scale the x-y footprint by a smooth
    angular profile so branch lobes and decision notches carve the outer
    contour itself.  Radial scaling of a star-shaped plan by a positive
    smooth factor cannot fold the surface, unlike meridian x-offsets."""
    lobes = p.get("plan_lobes")
    if not lobes:
        return x, y
    theta = math.atan2(y, x)
    gate = smoothstep(
        p.get("plan_gate0", 0.05), p.get("plan_gate1", 0.7), x / p["x_half"]
    )
    factor = 1.0
    for center, width, amp in lobes:
        factor += gate * amp * bump(theta, center, width)
    return x * factor, y * factor


def games_field(s: float, phi: float, p: dict):
    """Decision Field: entry stem, broad board, three unequal branch lobes."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    m = p["plan_m_tail"] if s < 0.0 else p["plan_m_lead"]
    rad = cap_profile(s, m)
    ny = 0.0 if at_pole else cyr

    width = p["width_stem"] + (p["width_body"] - p["width_stem"]) * smoothstep(
        p["stem_end"] - 0.14, p["stem_end"] + 0.22, u
    )
    # Lateral route-exit lobes: decision branches that leave the board
    # through the side contour (width modulation folds nothing).
    for lobe_u, lobe_w, lobe_amp, lobe_side in p.get("side_lobes", ()):
        if (cyr >= 0.0) == (lobe_side >= 0):
            width *= 1.0 + lobe_amp * bump(u, lobe_u, lobe_w)

    # Three macroscopic decision routes carve the leading contour itself.
    # The scallop scales meridian length as a function of the actual plan
    # coordinate (cyr * rad), so the pole is the deepest centre point and the
    # cap cannot form an inverted crater around it.
    ny_plan = 0.0 if at_pole else cyr * rad
    gate = smoothstep(p["finger_start"], 0.9, u)
    fingers = (
        p["finger_l"] * bump(ny_plan, -p["finger_pos"], p["finger_w"])
        + p["finger_c"] * bump(ny_plan, p["finger_c_pos"], p["finger_cw"])
        + p["finger_r"] * bump(ny_plan, p["finger_pos"], p["finger_w"])
    )
    notches = p["notch"] * (
        bump(ny_plan, -p["notch_pos"], p["notch_w"])
        + bump(ny_plan, p["notch_pos"], p["notch_w"])
    )
    meridian_scale = 1.0 + gate * (fingers - notches) / p["x_half"]

    top = p["top_h"]
    # Route ridges diverge from the shared entry toward the three lobes.
    # They also live in plan coordinates so they fade out over the shrinking
    # end caps instead of folding the pole fans.
    route_gate = smoothstep(0.10, 0.42, u)
    spread = smoothstep(0.18, 0.92, u)
    route_w = p.get("route_w", 0.20)
    for route_amp, route_dir in (
        (p["ridge_l"], -1.0),
        (p["ridge_c"], 0.12),
        (p["ridge_r"], 1.0),
    ):
        center = route_dir * p["route_spread"] * spread
        top += route_amp * route_gate * bump(ny_plan, center, route_w)
    top += p["pad_a"] * bump(u, 0.56, 0.16) * bump(ny_plan, -0.45, p.get("pad_nw", 0.30))
    top += p["pad_b"] * bump(u, 0.70, 0.13) * bump(ny_plan, 0.42, p.get("pad_nw", 0.26))
    top += p["entry_rise"] * bump(u, 0.05, 0.14) * bump(ny_plan, 0.0, 0.55)

    height = top if cz >= 0.0 else p["base_depth"]
    x = p["x_half"] * s * (meridian_scale if s > 0.0 else 1.0)
    y = width * cyr * rad
    z = height * czr * rad + p["arch"] * math.sin(math.pi * u) * rad
    x, y = _plan_lobes(x, y, p)
    return x, y, z


def video_frame(s: float, phi: float, p: dict):
    """Frame Sweep: tilted soft-rectangular screen plate with a temporal edge."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    m = p["plan_m"] * (1.0 + p["corner_m_bias"] * (cyr * (1.0 if s >= 0.0 else -1.0)))
    rad = cap_profile(s, max(2.0, m))
    ny = 0.0 if at_pole else cyr

    gamma = math.radians(p["gamma_deg"] - p["twist_deg"] * (u - 0.5))
    tall = p["tall"] * (1.0 + p["taper"] * (u - 0.5))
    tall_here = tall * (
        1.0 + (p["sweep"] * smoothstep(0.35, 0.95, u) if ny > 0.0 else 0.0)
    )
    tall_here *= 1.0 - (p["drop"] * smoothstep(0.6, 0.1, u) if ny < 0.0 else 0.0)
    thick = p["thick"] * (1.0 + p["thick_taper"] * (0.5 - u))
    # Screen relief: a broad shallow face inset ordered by the sweep.
    face = smoothstep(0.55, 0.95, czr) * bump(ny, p["face_ny"], 0.86)
    thick_here = thick * (1.0 - p["face_inset"] * face * bump(u, 0.5, 0.55))

    a_y, a_z = math.cos(gamma), math.sin(gamma)   # tall axis of the plate
    b_y, b_z = -math.sin(gamma), math.cos(gamma)  # face-normal axis

    yc = p["curve"] * (1.0 - (2.0 * u - 1.0) ** 2) - p["curve"] * 0.55
    e_t = tall_here * cyr * rad
    e_n = thick_here * czr * rad
    x = p["x_half"] * s
    y = yc + e_t * a_y + e_n * b_y
    z = e_t * a_z + e_n * b_z
    return x, y, z


def digital_substrate(s: float, phi: float, p: dict):
    """Routing Substrate: directed substrate with macro Y-logic and nodes."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    m = p["plan_m_tail"] if s < 0.0 else p["plan_m_lead"]
    rad = cap_profile(s, m)
    ny = 0.0 if at_pole else cyr

    width = p["width_stem"] + (p["width_fork"] - p["width_stem"]) * smoothstep(
        p["fork_u"] - 0.16, p["fork_u"] + 0.24, u
    )
    node_a = bump(u, p["node_a_u"], p["node_a_w"]) * bump(ny, p["node_a_ny"], 0.4)
    node_b = bump(u, p["node_b_u"], p["node_b_w"]) * bump(ny, p["node_b_ny"], 0.36)
    if (ny >= 0.0) == (p["node_a_ny"] >= 0.0):
        width *= 1.0 + p["node_a_bulge"] * bump(u, p["node_a_u"], p["node_a_w"] + 0.06)
    if (ny >= 0.0) == (p["node_b_ny"] >= 0.0):
        width *= 1.0 + p["node_b_bulge"] * bump(u, p["node_b_u"], p["node_b_w"] + 0.06)

    # Macro Y: the leading contour recedes at the centreline and extends at
    # the two branch tips; the trailing end stays one blunt input port.
    # The scallop reads the actual plan coordinate (cyr * rad) so the poles
    # stay the extreme point of their own meridian (no crater foldover).
    ny_plan = 0.0 if at_pole else cyr * rad
    gate_lead = smoothstep(p["split_start"], 0.9, u)
    lead_scale = 1.0 + gate_lead * (
        p["tip_l"] * bump(ny_plan, -p["tip_pos"], p["tip_w"])
        + p["tip_r"] * bump(ny_plan, p["tip_pos"], p["tip_w"])
        - p["split"] * bump(ny_plan, 0.0, p["split_w"])
    ) / p["x_half"]
    gate_tail = smoothstep(p["intake_start"], 0.1, u)
    tail_scale = (
        1.0 - gate_tail * p["intake"] * bump(ny_plan, 0.0, p["intake_w"]) / p["x_half"]
    )

    top = p["top_h"]
    channel_gate = smoothstep(p["fork_u"] - 0.18, p["fork_u"] + 0.10, u)
    top -= p["channel"] * channel_gate * bump(ny, 0.0, p["channel_w"] + 0.22 * u)
    top += p["node_a_h"] * node_a + p["node_b_h"] * node_b
    top += p["shoulder"] * bump(u, p["shoulder_u"], 0.18) * bump(ny, p["shoulder_ny"], 0.5)

    height = top if cz >= 0.0 else p["base_depth"]
    x = p["x_half"] * s * (lead_scale if s > 0.0 else tail_scale)
    yc = p["s_amp"] * math.sin(math.pi * (u - 0.5) * p["s_freq"])
    y = yc + width * cyr * rad
    z = height * czr * rad
    x, y = _plan_lobes(x, y, p)
    return x, y, z


def merch_parcel(s: float, phi: float, p: dict):
    """Wrapped Parcel: blocky core held by one continuous diagonal wrap."""
    u, cy, cz, at_pole = _frame(s, phi)
    n = p["cs_exponent"]
    cyr = sspow(cy, 2.0 / n)
    czr = sspow(cz, 2.0 / n)
    rad = cap_profile(s, p["plan_m"])
    ny = 0.0 if at_pole else cyr

    width = p["width"]
    top = p["top_h"]
    base = p["base_depth"]
    # Four unequal corner masses keep the parcel hand-made, not extruded.
    for corner_u, corner_ny, corner_amp in p["corners"]:
        c = bump(u, corner_u, 0.24) * bump(ny, corner_ny, 0.5)
        width *= 1.0 + corner_amp * c
        top += corner_amp * p["corner_h"] * c

    # One continuous diagonal wrap: centreline in (u, ny) from near-left to
    # far-right; it raises the top, carries around both side walls and steps
    # once where the surface overlaps itself.
    band_c = -1.0 + (u - p["band_u0"]) / max(1e-6, p["band_u1"] - p["band_u0"]) * 2.0
    d = ny - band_c
    band = bump(d, 0.0, p["band_w"])
    overlap = bump(d, -p["band_w"] * 0.8, p["band_w"] * 0.55) * bump(u, 0.5, 0.3)

    top += p["band_h"] * band + p["overlap_h"] * overlap
    base += p["band_under"] * band
    width *= 1.0 + p["band_side"] * band * smoothstep(0.35, 0.9, abs(ny))
    # Enclosed core pillows between the wrap and the corners.
    top += p["pillow"] * (1.0 - band) * bump(u, 0.5, 0.42) * bump(ny, 0.0, 0.6)

    height = top if cz >= 0.0 else base
    x = p["x_half"] * s * (1.0 - p["x_squash"] * bump(u, 0.5, 0.5))
    y = width * cyr * rad
    z = height * czr * rad
    z += p["band_shear"] * band * ny * rad * max(0.2, czr)
    return x, y, z


SURFACES = {
    "SINGLE_CONTENT_SEQUENCE": content_folio,
    "SINGLE_DESIGN_TORSION": design_palette,
    "SINGLE_EVENT_CONVERGENCE": event_canopy,
    "SINGLE_GAMES_BRANCH": games_field,
    "SINGLE_VIDEO_TEMPORAL": video_frame,
    "SINGLE_DIGITAL_SIGNAL": digital_substrate,
    "SINGLE_MERCH_WRAP": merch_parcel,
}


# ---------------------------------------------------------------------------
# Candidate parameter sets: 7 targets x 3 genuinely different macro passes.
# ---------------------------------------------------------------------------

CANDIDATES: dict[str, dict[str, dict]] = {
    "SINGLE_CONTENT_SEQUENCE": {
        "A": dict(
            cs_exponent=3.0, plan_m_left=3.4, plan_m_right=3.4, x_half=2.95,
            hinge_u=0.5, hinge_h=0.5, edge_h_left=1.1, edge_h_right=0.9,
            page_pow_left=1.15, page_pow_right=1.15, raise_right=0.0,
            curl=0.12, valley_extra=0.16, valley_w=0.10, beat=0.10,
            width=1.70, width_front_bias=0.0, width_hinge_pinch=0.02,
            base_depth=0.52, shorten_right=0.0, pitch=0.10,
        ),
        "B": dict(
            cs_exponent=3.0, plan_m_left=3.6, plan_m_right=3.2, x_half=2.78,
            hinge_u=0.5, hinge_h=0.46, edge_h_left=1.55, edge_h_right=1.15,
            page_pow_left=1.05, page_pow_right=1.25, raise_right=0.18,
            curl=0.18, valley_extra=0.2, valley_w=0.11, beat=0.12,
            width=1.66, width_front_bias=0.0, width_hinge_pinch=0.03,
            base_depth=0.56, shorten_right=0.06, pitch=0.14,
        ),
        "C": dict(
            cs_exponent=3.1, plan_m_left=3.8, plan_m_right=2.9, x_half=2.9,
            hinge_u=0.44, hinge_h=0.44, edge_h_left=0.95, edge_h_right=1.5,
            page_pow_left=1.3, page_pow_right=0.95, raise_right=0.22,
            curl=0.14, valley_extra=0.18, valley_w=0.1, beat=0.14,
            width=1.62, width_front_bias=0.16, width_hinge_pinch=0.02,
            base_depth=0.54, shorten_right=0.12, pitch=0.16,
        ),
    },
    "SINGLE_DESIGN_TORSION": {
        "A": dict(
            cs_exponent=3.1, plan_m=2.7, x_half=2.85,
            width_a=1.72, width_b=1.6,
            bite_far=0.52, bite_u=0.6, bite_w=0.26,
            lobe_far=0.16, lobe_u=0.16, lobe_w=0.3,
            bite_near=0.0, bite_near_u=0.5, bite_near_w=0.2,
            lobe_near=0.22, lobe_near_u=0.34, lobe_near_w=0.4,
            entry_pinch=0.1,
            top_h=0.6, shelf=0.0, dish=0.16, dish_u=0.42,
            corner_u=0.88, corner_w=0.2, corner_ny=-0.55, corner_nw=0.5,
            corner_lift=1.05, base_depth=0.44, twist=0.16, drift=0.12,
        ),
        "B": dict(
            cs_exponent=3.3, plan_m=2.9, x_half=2.8,
            width_a=1.3, width_b=1.95,
            bite_far=0.0, bite_u=0.5, bite_w=0.2,
            lobe_far=0.14, lobe_u=0.78, lobe_w=0.3,
            bite_near=0.46, bite_near_u=0.55, bite_near_w=0.24,
            lobe_near=0.12, lobe_near_u=0.2, lobe_near_w=0.3,
            entry_pinch=0.06,
            top_h=0.52, shelf=0.3, dish=0.14, dish_u=0.5,
            corner_u=0.14, corner_w=0.24, corner_ny=0.55, corner_nw=0.55,
            corner_lift=1.0, base_depth=0.46, twist=0.1, drift=-0.1,
        ),
        "C": dict(
            cs_exponent=3.0, plan_m=2.6, x_half=2.9,
            width_a=1.68, width_b=1.55,
            bite_far=0.5, bite_u=0.58, bite_w=0.24,
            lobe_far=0.18, lobe_u=0.14, lobe_w=0.28,
            bite_near=0.0, bite_near_u=0.5, bite_near_w=0.2,
            lobe_near=0.2, lobe_near_u=0.4, lobe_near_w=0.42,
            entry_pinch=0.3,
            top_h=0.58, shelf=0.0, dish=0.18, dish_u=0.4,
            corner_u=0.86, corner_w=0.22, corner_ny=-0.5, corner_nw=0.5,
            corner_lift=0.85, base_depth=0.42, twist=0.35, drift=0.14,
        ),
    },
    "SINGLE_EVENT_CONVERGENCE": {
        "A": dict(
            cs_exponent=2.7, plan_m=2.9, x_half=3.05, width=1.72,
            eaves=((0.12, -0.7, 0.3, 0.22), (0.85, 0.7, 0.26, 0.24)),
            apex_u=0.58, apex_ny=-0.25, apex_h=1.6, slope_u=1.7, slope_ny=1.3,
            roof_pow=1.15, rim_a=0.5, rim_b=0.44, top_min=0.36,
            shoulder_h=0.0, shoulder_u=0.0, shoulder_ny=0.0,
            base_depth=0.58, eave_drop=0.08,
        ),
        "B": dict(
            cs_exponent=2.8, plan_m=2.7, x_half=2.95, width=1.75,
            eaves=((0.8, -0.75, 0.4, 0.3),),
            apex_u=0.42, apex_ny=0.1, apex_h=1.9, slope_u=2.1, slope_ny=1.5,
            roof_pow=1.05, rim_a=0.58, rim_b=0.46, top_min=0.44,
            shoulder_h=0.0, shoulder_u=0.0, shoulder_ny=0.0,
            base_depth=0.74, eave_drop=0.08,
        ),
        "C": dict(
            cs_exponent=2.6, plan_m=3.1, x_half=3.0, width=1.7,
            eaves=((0.1, 0.65, 0.28, 0.2), (0.55, -0.8, 0.3, 0.26), (0.9, 0.6, 0.22, 0.2)),
            apex_u=0.62, apex_ny=-0.3, apex_h=1.52, slope_u=1.8, slope_ny=1.35,
            roof_pow=1.2, rim_a=0.46, rim_b=0.42, top_min=0.36,
            shoulder_h=0.95, shoulder_u=0.25, shoulder_ny=0.3,
            base_depth=0.58, eave_drop=0.07,
        ),
    },
    "SINGLE_GAMES_BRANCH": {
        "A": dict(
            cs_exponent=3.0, plan_m_tail=2.9, plan_m_lead=3.6, x_half=2.85,
            width_stem=0.85, width_body=1.7, stem_end=0.3,
            finger_start=0.5, finger_pos=0.68, finger_w=0.4,
            finger_l=0.42, finger_c=0.5, finger_c_pos=0.02, finger_cw=0.32,
            finger_r=0.3, notch=0.2, notch_pos=0.34, notch_w=0.24,
            top_h=0.52, ridge_l=0.26, ridge_c=0.2, ridge_r=0.22,
            route_spread=0.6, pad_a=0.24, pad_b=0.18, entry_rise=0.2,
            base_depth=0.44, arch=0.0,
        ),
        "B": dict(
            cs_exponent=3.2, plan_m_tail=2.5, plan_m_lead=3.4, x_half=2.9,
            width_stem=0.95, width_body=1.85, stem_end=0.55,
            finger_start=0.52, finger_pos=0.7, finger_w=0.42,
            finger_l=0.52, finger_c=0.38, finger_c_pos=-0.04, finger_cw=0.34,
            finger_r=0.26, notch=0.2, notch_pos=0.36, notch_w=0.24,
            top_h=0.5, ridge_l=0.28, ridge_c=0.18, ridge_r=0.2,
            route_spread=0.64, pad_a=0.26, pad_b=0.14, entry_rise=0.16,
            base_depth=0.46, arch=0.0,
        ),
        "C": dict(
            cs_exponent=3.0, plan_m_tail=3.1, plan_m_lead=3.8, x_half=2.8,
            width_stem=0.8, width_body=1.75, stem_end=0.34,
            finger_start=0.48, finger_pos=0.66, finger_w=0.38,
            finger_l=0.55, finger_c=0.42, finger_c_pos=0.05, finger_cw=0.3,
            finger_r=0.3, notch=0.22, notch_pos=0.33, notch_w=0.22,
            top_h=0.5, ridge_l=0.24, ridge_c=0.26, ridge_r=0.2,
            route_spread=0.58, pad_a=0.22, pad_b=0.2, entry_rise=0.24,
            base_depth=0.44, arch=0.12,
        ),
    },
    "SINGLE_VIDEO_TEMPORAL": {
        "A": dict(
            cs_exponent=2.25, plan_m=3.3, corner_m_bias=0.18, x_half=3.05,
            gamma_deg=37.0, twist_deg=1.5, tall=1.52, taper=0.1,
            sweep=0.2, drop=0.0, thick=0.56, thick_taper=0.2,
            face_ny=0.15, face_inset=0.16, curve=0.24,
        ),
        "B": dict(
            cs_exponent=2.4, plan_m=3.5, corner_m_bias=0.24, x_half=2.95,
            gamma_deg=39.0, twist_deg=2.0, tall=1.48, taper=0.14,
            sweep=0.15, drop=0.08, thick=0.52, thick_taper=0.3,
            face_ny=0.1, face_inset=0.18, curve=0.36,
        ),
        "C": dict(
            cs_exponent=2.3, plan_m=3.1, corner_m_bias=0.14, x_half=3.2,
            gamma_deg=36.0, twist_deg=1.5, tall=1.4, taper=0.06,
            sweep=0.35, drop=0.1, thick=0.5, thick_taper=0.1,
            face_ny=0.2, face_inset=0.15, curve=0.24,
        ),
    },
    "SINGLE_DIGITAL_SIGNAL": {
        "A": dict(
            cs_exponent=3.1, plan_m_tail=3.4, plan_m_lead=3.6, x_half=3.1,
            width_stem=1.0, width_fork=1.42, fork_u=0.42,
            node_a_u=0.55, node_a_w=0.14, node_a_ny=-0.55, node_a_bulge=0.16, node_a_h=0.34,
            node_b_u=0.72, node_b_w=0.12, node_b_ny=0.45, node_b_bulge=0.1, node_b_h=0.26,
            split_start=0.52, split=0.42, split_w=0.36,
            tip_l=0.3, tip_r=0.22, tip_pos=0.64, tip_w=0.38,
            intake=0.0, intake_start=0.2, intake_w=0.3,
            top_h=0.55, channel=0.2, channel_w=0.16,
            shoulder=0.0, shoulder_u=0.8, shoulder_ny=0.0,
            base_depth=0.46, s_amp=0.0, s_freq=1.0,
        ),
        "B": dict(
            cs_exponent=3.3, plan_m_tail=3.6, plan_m_lead=3.6, x_half=3.15,
            width_stem=1.35, width_fork=1.15, fork_u=0.5,
            node_a_u=0.72, node_a_w=0.16, node_a_ny=0.3, node_a_bulge=0.2, node_a_h=0.42,
            node_b_u=0.4, node_b_w=0.12, node_b_ny=-0.4, node_b_bulge=0.08, node_b_h=0.2,
            split_start=0.9, split=0.0, split_w=0.3,
            tip_l=0.0, tip_r=0.0, tip_pos=0.6, tip_w=0.3,
            intake=0.55, intake_start=0.36, intake_w=0.55,
            top_h=0.52, channel=0.22, channel_w=0.2,
            shoulder=0.3, shoulder_u=0.82, shoulder_ny=0.15,
            base_depth=0.48, s_amp=0.0, s_freq=1.0,
        ),
        "C": dict(
            cs_exponent=3.0, plan_m_tail=3.2, plan_m_lead=3.4, x_half=3.2,
            width_stem=1.15, width_fork=1.3, fork_u=0.45,
            node_a_u=0.32, node_a_w=0.13, node_a_ny=-0.45, node_a_bulge=0.18, node_a_h=0.36,
            node_b_u=0.68, node_b_w=0.13, node_b_ny=0.45, node_b_bulge=0.18, node_b_h=0.36,
            split_start=0.56, split=0.36, split_w=0.32,
            tip_l=0.26, tip_r=0.18, tip_pos=0.6, tip_w=0.36,
            intake=0.0, intake_start=0.2, intake_w=0.3,
            top_h=0.54, channel=0.18, channel_w=0.15,
            shoulder=0.0, shoulder_u=0.8, shoulder_ny=0.0,
            base_depth=0.46, s_amp=0.42, s_freq=1.7,
        ),
    },
    "SINGLE_MERCH_WRAP": {
        "A": dict(
            cs_exponent=4.6, plan_m=4.2, x_half=2.05, x_squash=0.0,
            width=1.5, top_h=1.02, base_depth=0.95,
            corners=((0.14, -0.7, 0.16), (0.14, 0.72, 0.09), (0.86, -0.68, 0.13), (0.86, 0.7, 0.05)),
            corner_h=0.4,
            band_u0=0.15, band_u1=0.85, band_w=0.44,
            band_h=0.26, band_under=0.1, band_side=0.14,
            overlap_h=0.13, pillow=0.1, band_shear=0.08,
        ),
        "B": dict(
            cs_exponent=5.0, plan_m=4.6, x_half=2.35, x_squash=0.0,
            width=1.42, top_h=0.92, base_depth=0.88,
            corners=((0.12, -0.72, 0.18), (0.12, 0.7, 0.06), (0.88, -0.65, 0.12), (0.88, 0.72, -0.08)),
            corner_h=0.35,
            band_u0=0.08, band_u1=0.92, band_w=0.55,
            band_h=0.3, band_under=0.12, band_side=0.18,
            overlap_h=0.15, pillow=0.08, band_shear=0.1,
        ),
        "C": dict(
            cs_exponent=4.4, plan_m=4.0, x_half=1.95, x_squash=0.05,
            width=1.58, top_h=1.18, base_depth=1.05,
            corners=((0.15, -0.68, 0.14), (0.15, 0.7, 0.1), (0.85, -0.7, 0.15), (0.85, 0.68, 0.04)),
            corner_h=0.45,
            band_u0=0.18, band_u1=0.82, band_w=0.4,
            band_h=0.28, band_under=0.08, band_side=0.12,
            overlap_h=0.12, pillow=0.14, band_shear=0.06,
        ),
    },
}


# ---------------------------------------------------------------------------
# Refinement iterations on the visually selected macro candidates.  The 21
# A/B/C macro candidates above stay frozen as the D-R3 candidate record;
# every subsequent coarse-to-fine cycle lands here as a new named variant.
# ---------------------------------------------------------------------------

REFINED: dict[str, dict[str, dict]] = {
    # R1: routes must read as broad flat decision paths on a flatter board,
    # not leaf veins on a saddle; three lobes separated in plan.
    "SINGLE_GAMES_BRANCH": {
        "R1": dict(
            cs_exponent=3.6, plan_m_tail=2.5, plan_m_lead=3.8, x_half=2.9,
            width_stem=1.05, width_body=1.85, stem_end=0.42,
            finger_start=0.5, finger_pos=0.7, finger_w=0.42,
            finger_l=0.6, finger_c=0.5, finger_c_pos=-0.04, finger_cw=0.34,
            finger_r=0.4, notch=0.3, notch_pos=0.36, notch_w=0.28,
            top_h=0.5, ridge_l=0.2, ridge_c=0.14, ridge_r=0.16,
            route_spread=0.72, route_w=0.3, pad_nw=0.4,
            pad_a=0.34, pad_b=0.22, entry_rise=0.16,
            base_depth=0.46, arch=0.0, mask_balance=0.1,
        ),
        # R2: three routes leave the board through the contour itself - two
        # asymmetric lateral exit lobes plus the blunt leading route; deeper
        # safe meridian scallop separates the leading edge.
        "R2": dict(
            cs_exponent=3.6, plan_m_tail=2.5, plan_m_lead=3.8, x_half=2.7,
            width_stem=1.0, width_body=1.8, stem_end=0.42,
            side_lobes=((0.62, 0.24, 0.22, 1), (0.8, 0.2, 0.3, -1)),
            finger_start=0.5, finger_pos=0.7, finger_w=0.42,
            finger_l=0.55, finger_c=0.44, finger_c_pos=-0.04, finger_cw=0.34,
            finger_r=0.35, notch=0.3, notch_pos=0.36, notch_w=0.28,
            top_h=0.52, ridge_l=0.2, ridge_c=0.14, ridge_r=0.16,
            route_spread=0.72, route_w=0.3, pad_nw=0.4,
            pad_a=0.3, pad_b=0.2, entry_rise=0.16,
            base_depth=0.52, arch=0.0, mask_balance=0.07,
        ),
        # R3: the three-route contour must survive 96 px - deeper notches
        # between longer route fingers and stronger lateral exit lobes so the
        # silhouette itself branches instead of reading as a lumpy sliver.
        # Margins tuned so the flat board survives TRANSITION_TENSION at 1.0
        # and 90/10 blends toward VIDEO without local face collapse.
        "R3": dict(
            cs_exponent=3.6, plan_m_tail=2.5, plan_m_lead=3.8, x_half=2.75,
            width_stem=1.08, width_body=1.8, stem_end=0.42,
            side_lobes=((0.58, 0.42, 0.12, 1), (0.8, 0.3, 0.26, -1)),
            finger_start=0.48, finger_pos=0.7, finger_w=0.4,
            finger_l=0.62, finger_c=0.5, finger_c_pos=-0.04, finger_cw=0.36,
            finger_r=0.4, notch=0.38, notch_pos=0.38, notch_w=0.34,
            top_h=0.58, ridge_l=0.2, ridge_c=0.14, ridge_r=0.16,
            route_spread=0.72, route_w=0.3, pad_nw=0.4,
            pad_a=0.3, pad_b=0.2, entry_rise=0.16,
            base_depth=0.5, arch=0.0, mask_balance=0.07,
        ),
    },
    # R1: blunt parallel Y-branches instead of a beak/fin; deeper split.
    "SINGLE_DIGITAL_SIGNAL": {
        "R1": dict(
            cs_exponent=3.1, plan_m_tail=3.4, plan_m_lead=4.4, x_half=3.1,
            width_stem=1.0, width_fork=1.42, fork_u=0.42,
            node_a_u=0.55, node_a_w=0.14, node_a_ny=-0.55, node_a_bulge=0.16, node_a_h=0.34,
            node_b_u=0.72, node_b_w=0.12, node_b_ny=0.45, node_b_bulge=0.1, node_b_h=0.26,
            split_start=0.52, split=0.48, split_w=0.3,
            tip_l=0.34, tip_r=0.26, tip_pos=0.55, tip_w=0.3,
            intake=0.0, intake_start=0.2, intake_w=0.3,
            top_h=0.55, channel=0.2, channel_w=0.16,
            shoulder=0.0, shoulder_u=0.8, shoulder_ny=0.0,
            base_depth=0.46, s_amp=0.0, s_freq=1.0, mask_balance=0.06,
        ),
        # R2: wider blunter fork end with a deeper safe convergence notch so
        # the Y reads as routing, not a beak.
        "R2": dict(
            cs_exponent=3.1, plan_m_tail=3.4, plan_m_lead=4.0, x_half=3.05,
            width_stem=1.0, width_fork=1.6, fork_u=0.42,
            node_a_u=0.55, node_a_w=0.14, node_a_ny=-0.55, node_a_bulge=0.16, node_a_h=0.34,
            node_b_u=0.72, node_b_w=0.12, node_b_ny=0.45, node_b_bulge=0.1, node_b_h=0.26,
            split_start=0.5, split=0.55, split_w=0.34,
            tip_l=0.36, tip_r=0.28, tip_pos=0.58, tip_w=0.3,
            intake=0.0, intake_start=0.2, intake_w=0.3,
            top_h=0.55, channel=0.2, channel_w=0.16,
            shoulder=0.0, shoulder_u=0.8, shoulder_ny=0.0,
            base_depth=0.46, s_amp=0.0, s_freq=1.0, mask_balance=0.06,
        ),
    },
    # R1: stronger eaves and a slightly higher offset apex on candidate A.
    "SINGLE_EVENT_CONVERGENCE": {
        "R1": dict(
            cs_exponent=2.7, plan_m=2.9, x_half=3.05, width=1.72,
            eaves=((0.12, -0.7, 0.34, 0.24), (0.85, 0.7, 0.3, 0.26)),
            apex_u=0.58, apex_ny=-0.25, apex_h=1.7, slope_u=1.7, slope_ny=1.3,
            roof_pow=1.15, rim_a=0.5, rim_b=0.44, top_min=0.36,
            shoulder_h=0.0, shoulder_u=0.0, shoulder_ny=0.0,
            base_depth=0.58, eave_drop=0.08, mask_balance=0.15,
        ),
        # R2: straighter roof planes, deeper eave drop and a taller offset
        # apex so the canopy reads as sheltering mass, not a soft leaf.
        "R2": dict(
            cs_exponent=2.7, plan_m=2.9, x_half=3.05, width=1.72,
            eaves=((0.12, -0.7, 0.36, 0.26), (0.85, 0.7, 0.32, 0.28)),
            apex_u=0.58, apex_ny=-0.25, apex_h=1.8, slope_u=1.7, slope_ny=1.3,
            roof_pow=1.0, rim_a=0.5, rim_b=0.44, top_min=0.36,
            shoulder_h=0.0, shoulder_u=0.0, shoulder_ny=0.0,
            base_depth=0.62, eave_drop=0.12, mask_balance=0.16,
        ),
        # R3: planar tent faces (roof_pow < 1), broader eave overhangs and a
        # blunter footprint push the canonical read from sail/dune to a
        # sheltering tensile roof over a stable base.
        # Rim margins widened so the far flank survives TRANSITION_TENSION
        # at 1.0 and 90/10 blends toward VIDEO without local face collapse.
        "R3": dict(
            cs_exponent=2.7, plan_m=3.2, x_half=3.0, width=1.76,
            eaves=((0.14, -0.7, 0.32, 0.32), (0.82, 0.7, 0.22, 0.36)),
            apex_u=0.56, apex_ny=-0.28, apex_h=1.85, slope_u=1.6, slope_ny=1.25,
            roof_pow=0.9, rim_a=0.52, rim_b=0.5, top_min=0.44,
            shoulder_h=0.0, shoulder_u=0.0, shoulder_ny=0.0,
            base_depth=0.7, eave_drop=0.07, mask_balance=0.16,
        ),
    },
}


def variants(name: str) -> dict[str, dict]:
    merged = dict(CANDIDATES[name])
    merged.update(REFINED.get(name, {}))
    return merged


# Visually selected variant per target after the Level-A macro gate review.
SELECTED: dict[str, str] = {
    "SINGLE_CONTENT_SEQUENCE": "B",
    "SINGLE_DESIGN_TORSION": "B",
    "SINGLE_EVENT_CONVERGENCE": "R3",
    "SINGLE_GAMES_BRANCH": "R3",
    "SINGLE_VIDEO_TEMPORAL": "C",
    "SINGLE_DIGITAL_SIGNAL": "R2",
    "SINGLE_MERCH_WRAP": "C",
}


# ---------------------------------------------------------------------------
# Post-processing: recenter, per-target mask-area balance, envelope clamp.
# ---------------------------------------------------------------------------

MASK_BALANCE: dict[str, dict[str, float]] = {
    # amount per variant, tuned numerically; positive pulls the mask zone in.
    "SINGLE_CONTENT_SEQUENCE": {"A": 0.0, "B": 0.0, "C": 0.05},
    "SINGLE_DESIGN_TORSION": {"A": 0.13, "B": 0.0, "C": 0.15},
    "SINGLE_EVENT_CONVERGENCE": {"A": 0.15, "B": 0.18, "C": 0.13},
    "SINGLE_GAMES_BRANCH": {"A": 0.12, "B": 0.1, "C": 0.12},
    "SINGLE_VIDEO_TEMPORAL": {"A": -0.04, "B": 0.0, "C": 0.0},
    "SINGLE_DIGITAL_SIGNAL": {"A": 0.06, "B": 0.06, "C": 0.06},
    "SINGLE_MERCH_WRAP": {"A": -0.18, "B": -0.15, "C": -0.18},
}


def recenter(positions):
    centers = [
        (min(p[a] for p in positions) + max(p[a] for p in positions)) * 0.5
        for a in range(3)
    ]
    return [tuple(p[a] - centers[a] for a in range(3)) for p in positions]


def balance_mask_area(positions, parameters, amount: float):
    if abs(amount) < 1e-9:
        return positions
    centers = [
        sum(point[axis] for point in positions) / len(positions) for axis in range(3)
    ]
    result = []
    for point, (s, phi) in zip(positions, parameters):
        body = max(0.0, 1.0 - s * s)
        zone = photonic_zone_field(s, phi)
        scale = 1.0 - amount * zone * body
        result.append(
            (
                point[0],
                centers[1] + (point[1] - centers[1]) * scale,
                centers[2] + (point[2] - centers[2]) * scale,
            )
        )
    return result


def clamp_envelope(positions, tension_delta=None):
    """Hard-max envelope clamp, additionally additive-safe per vertex."""
    halves = [TARGET_BBOX[a] * 0.5 for a in range(3)]
    output = []
    for index, point in enumerate(positions):
        vertex = []
        for axis in range(3):
            low, high = -halves[axis], halves[axis]
            if tension_delta is not None:
                delta = tension_delta[index][axis]
                if delta > 0.0:
                    high = min(high, halves[axis] - delta)
                elif delta < 0.0:
                    low = max(low, -halves[axis] - delta)
            vertex.append(max(low, min(high, point[axis])))
        output.append(tuple(vertex))
    return output


def build_single(name: str, variant: str, parameters, tension_delta=None,
                 params: dict | None = None):
    """Author one SINGLE target as a full parametric macro surface."""
    surface = SURFACES[name]
    p = params if params is not None else variants(name)[variant]
    positions = [surface(s, phi, p) for s, phi in parameters]
    positions = recenter(positions)
    amount = p.get("mask_balance", MASK_BALANCE.get(name, {}).get(variant, 0.0))
    positions = balance_mask_area(positions, parameters, amount)
    positions = clamp_envelope(positions, tension_delta)
    return positions


def topology_parameters(segments: int = 160, interior_rings: int = 52):
    values = [(-1.0, 0.0)]
    for ring in range(1, interior_rings + 1):
        s = -1.0 + 2.0 * ring / (interior_rings + 1)
        for segment in range(segments):
            values.append((s, math.tau * segment / segments))
    values.append((1.0, 0.0))
    return values
