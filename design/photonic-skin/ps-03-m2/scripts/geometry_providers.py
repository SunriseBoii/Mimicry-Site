"""PS-03.M2 geometry provider registry.

A geometry provider is a pure function of points that returns a signed
distance.  Providers are addressed by name from TargetDefinition data, so a
new subject form is described as a provider tree in JSON and never as a new
branch in the pipeline.

Node shape (as it appears in a TargetDefinition):

    {
      "provider": "smooth_union",
      "params": {"k": 0.05},
      "transform": {"translate": [x, y, z], "rotateDeg": [rx, ry, rz], "scale": s},
      "children": [ <node>, ... ]
    }

`compile_node` turns such a tree into a callable ``f(points) -> distances``.
Points are ``(n, 3)`` float64 arrays; distances are ``(n,)`` float64.

Distance exactness: primitives marked ``bounded`` return a conservative
bounded field rather than a true Euclidean distance (ellipsoid, elliptic
plate, revolved profile).  Sign is always correct, the zero level set is
exact, and gradients are usable, which is what polygonisation, projection
and thickness probing need.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Sequence

import numpy as np

Field = Callable[[np.ndarray], np.ndarray]


# ---------------------------------------------------------------------------
# Registry plumbing.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ProviderSpec:
    name: str
    kind: str                       # "primitive" | "operator" | "asset"
    min_children: int
    max_children: int | None
    required: tuple[str, ...] = ()
    optional: tuple[str, ...] = ()
    exact: bool = True
    doc: str = ""


REGISTRY: dict[str, ProviderSpec] = {}
_IMPL: dict[str, Callable] = {}


def provider(spec: ProviderSpec):
    def wrap(fn):
        REGISTRY[spec.name] = spec
        _IMPL[spec.name] = fn
        return fn

    return wrap


def provider_names() -> list[str]:
    return sorted(REGISTRY)


# ---------------------------------------------------------------------------
# Small helpers shared by primitives.
# ---------------------------------------------------------------------------


AXES = {"x": 0, "y": 1, "z": 2}


def _axis(name: str) -> int:
    if name not in AXES:
        raise ValueError(f"unknown axis {name!r}")
    return AXES[name]


def _v3(value: Sequence[float]) -> np.ndarray:
    arr = np.asarray(value, dtype=np.float64)
    if arr.shape != (3,):
        raise ValueError(f"expected a 3-vector, got {value!r}")
    return arr


def smin(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    """Polynomial smooth minimum (C1 smooth union)."""
    if k <= 0.0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    return -smin(-a, -b, k)


def euler_matrix(degrees: Sequence[float]) -> np.ndarray:
    """Intrinsic X-then-Y-then-Z rotation matrix from degrees."""
    rx, ry, rz = np.radians(np.asarray(degrees, dtype=np.float64))
    cx, sx = np.cos(rx), np.sin(rx)
    cy, sy = np.cos(ry), np.sin(ry)
    cz, sz = np.cos(rz), np.sin(rz)
    mx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float64)
    my = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float64)
    mz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float64)
    return mz @ my @ mx


# ---------------------------------------------------------------------------
# Primitives.
# ---------------------------------------------------------------------------


@provider(ProviderSpec("sphere", "primitive", 0, 0, required=("radius",),
                       optional=("center",), doc="Exact sphere."))
def _sphere(p, params, _children):
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    return np.linalg.norm(p - center, axis=1) - float(params["radius"])


@provider(ProviderSpec("rounded_box", "primitive", 0, 0, required=("half",),
                       optional=("radius", "center"),
                       doc="Exact box with rounded edges."))
def _rounded_box(p, params, _children):
    radius = float(params.get("radius", 0.0))
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    half = _v3(params["half"]) - radius
    q = np.abs(p - center) - half
    outside = np.linalg.norm(np.maximum(q, 0.0), axis=1)
    inside = np.minimum(np.max(q, axis=1), 0.0)
    return outside + inside - radius


@provider(ProviderSpec("capsule", "primitive", 0, 0, required=("a", "b", "radius"),
                       doc="Exact capsule between two points."))
def _capsule(p, params, _children):
    a = _v3(params["a"])
    b = _v3(params["b"])
    pa = p - a
    ba = b - a
    denom = float(ba @ ba)
    h = np.clip(pa @ ba / max(denom, 1e-12), 0.0, 1.0)
    return np.linalg.norm(pa - np.outer(h, ba), axis=1) - float(params["radius"])


@provider(ProviderSpec("tapered_capsule", "primitive", 0, 0,
                       required=("a", "b", "radiusA", "radiusB"),
                       doc="Exact round cone (capsule with two radii)."))
def _tapered_capsule(p, params, _children):
    a = _v3(params["a"])
    b = _v3(params["b"])
    r1 = float(params["radiusA"])
    r2 = float(params["radiusB"])
    ba = b - a
    length2 = float(ba @ ba)
    rr = r1 - r2
    a2 = length2 - rr * rr
    il2 = 1.0 / max(length2, 1e-12)

    pa = p - a
    y = pa @ ba
    z = y - length2
    x2 = np.einsum("ij,ij->i", pa * length2 - np.outer(y, ba),
                   pa * length2 - np.outer(y, ba))
    y2 = y * y * length2
    z2 = z * z * length2

    k = np.sign(rr) * rr * rr * x2
    out = np.empty(len(p), dtype=np.float64)
    cap_b = np.sign(z) * a2 * z2 > k
    cap_a = (np.sign(y) * a2 * y2 < k) & ~cap_b
    body = ~(cap_a | cap_b)
    out[cap_b] = np.sqrt(x2[cap_b] + z2[cap_b]) * il2 - r2
    out[cap_a] = np.sqrt(x2[cap_a] + y2[cap_a]) * il2 - r1
    out[body] = (
        np.sqrt(x2[body] * a2 * il2) + y[body] * rr
    ) * il2 - r1
    return out


@provider(ProviderSpec("ellipsoid", "primitive", 0, 0, required=("radii",),
                       optional=("center",), exact=False,
                       doc="Bounded ellipsoid field (Quilez approximation)."))
def _ellipsoid(p, params, _children):
    radii = _v3(params["radii"])
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    q = (p - center) / radii
    k0 = np.linalg.norm(q, axis=1)
    k1 = np.linalg.norm(q / radii, axis=1)
    return np.where(k1 > 1e-12, k0 * (k0 - 1.0) / np.maximum(k1, 1e-12),
                    -float(radii.min()))


@provider(ProviderSpec("torus", "primitive", 0, 0,
                       required=("majorRadius", "minorRadius"),
                       optional=("axis", "center"),
                       doc="Exact torus around the given axis."))
def _torus(p, params, _children):
    axis = _axis(params.get("axis", "z"))
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    q = p - center
    plane = [i for i in range(3) if i != axis]
    radial = np.hypot(q[:, plane[0]], q[:, plane[1]]) - float(params["majorRadius"])
    return np.hypot(radial, q[:, axis]) - float(params["minorRadius"])


@provider(ProviderSpec("slab", "primitive", 0, 0, required=("axis", "half"),
                       optional=("center",),
                       doc="Infinite slab; useful as a boolean cutter."))
def _slab(p, params, _children):
    axis = _axis(params["axis"])
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    return np.abs(p[:, axis] - center[axis]) - float(params["half"])


@provider(ProviderSpec("plane_slab", "primitive", 0, 0,
                       required=("normal", "half"), optional=("offset",),
                       doc="Slab with an arbitrary plane normal; the normal is "
                           "normalised, offset and half are true distances."))
def _plane_slab(p, params, _children):
    normal = _v3(params["normal"])
    normal = normal / max(float(np.linalg.norm(normal)), 1e-30)
    return np.abs(p @ normal - float(params.get("offset", 0.0))) - float(
        params["half"]
    )


@provider(ProviderSpec("rounded_plate", "primitive", 0, 0,
                       required=("radii", "thickness"),
                       optional=("edgeRadius", "center", "axis"), exact=False,
                       doc="Elliptical plate with rounded rim; bounded field."))
def _rounded_plate(p, params, _children):
    axis = _axis(params.get("axis", "z"))
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    edge = float(params.get("edgeRadius", 0.0))
    radii = np.asarray(params["radii"], dtype=np.float64)
    if radii.shape != (2,):
        raise ValueError("rounded_plate.radii must be a 2-vector")
    radii = radii - edge
    half = float(params["thickness"]) * 0.5 - edge
    plane = [i for i in range(3) if i != axis]
    q = p - center
    # Bounded elliptic-cylinder distance: normalise, then rescale by the
    # smaller semi-axis so the field never overshoots the true distance.
    e = q[:, plane] / radii
    radial = (np.linalg.norm(e, axis=1) - 1.0) * float(radii.min())
    axial = np.abs(q[:, axis]) - half
    outside = np.hypot(np.maximum(radial, 0.0), np.maximum(axial, 0.0))
    inside = np.minimum(np.maximum(radial, axial), 0.0)
    return outside + inside - edge


@provider(ProviderSpec("revolved_profile", "primitive", 0, 0,
                       required=("height", "profile"),
                       optional=("axis", "center", "radialScale",
                                 "angularScallops"), exact=False,
                       doc="Surface of revolution from a (t, radius) profile, "
                           "with optional periodic angular scallops."))
def _revolved_profile(p, params, _children):
    axis = _axis(params.get("axis", "z"))
    center = _v3(params.get("center", (0.0, 0.0, 0.0)))
    height = float(params["height"])
    radial_scale = float(params.get("radialScale", 1.0))
    profile = np.asarray(params["profile"], dtype=np.float64)
    if profile.ndim != 2 or profile.shape[1] != 2:
        raise ValueError("revolved_profile.profile must be a list of [t, radius]")

    q = p - center
    plane = [i for i in range(3) if i != axis]
    t01 = np.clip((q[:, axis] + height * 0.5) / height, 0.0, 1.0)
    radius = np.interp(t01, profile[:, 0], profile[:, 1]) * radial_scale

    scallops = params.get("angularScallops")
    if scallops:
        count = int(scallops["count"])
        depth = float(scallops["depth"])
        band0, band1 = (float(x) for x in scallops["band"])
        theta = np.arctan2(q[:, plane[1]], q[:, plane[0]])
        band = np.clip((t01 - band0) / max(band1 - band0, 1e-9), 0.0, 1.0)
        band = band * band * (3.0 - 2.0 * band)
        band *= np.clip(1.0 - (t01 - band1) * 14.0, 0.0, 1.0)
        radius = radius - depth * band * (0.5 - 0.5 * np.cos(theta * count))

    radial = np.hypot(q[:, plane[0]], q[:, plane[1]]) - radius
    axial = np.abs(q[:, axis]) - height * 0.5
    return np.maximum(radial, axial)


# ---------------------------------------------------------------------------
# Operators.
# ---------------------------------------------------------------------------


@provider(ProviderSpec("union", "operator", 1, None, doc="Hard union."))
def _union(_p, _params, children):
    out = children[0]
    for child in children[1:]:
        out = np.minimum(out, child)
    return out


@provider(ProviderSpec("smooth_union", "operator", 2, None, required=("k",),
                       doc="Polynomial smooth union of all children."))
def _smooth_union(_p, params, children):
    k = float(params["k"])
    out = children[0]
    for child in children[1:]:
        out = smin(out, child, k)
    return out


@provider(ProviderSpec("subtract", "operator", 2, None,
                       doc="children[0] minus the union of the rest."))
def _subtract(_p, _params, children):
    cutter = children[1]
    for child in children[2:]:
        cutter = np.minimum(cutter, child)
    return np.maximum(children[0], -cutter)


@provider(ProviderSpec("smooth_subtract", "operator", 2, None, required=("k",),
                       doc="Smooth version of subtract."))
def _smooth_subtract(_p, params, children):
    k = float(params["k"])
    cutter = children[1]
    for child in children[2:]:
        cutter = np.minimum(cutter, child)
    return smax(children[0], -cutter, k)


@provider(ProviderSpec("intersect", "operator", 2, None, doc="Hard intersection."))
def _intersect(_p, _params, children):
    out = children[0]
    for child in children[1:]:
        out = np.maximum(out, child)
    return out


@provider(ProviderSpec("smooth_intersect", "operator", 2, None, required=("k",),
                       doc="Smooth intersection."))
def _smooth_intersect(_p, params, children):
    k = float(params["k"])
    out = children[0]
    for child in children[1:]:
        out = smax(out, child, k)
    return out


@provider(ProviderSpec("offset", "operator", 1, 1, required=("distance",),
                       doc="Grow (positive) or shrink (negative) the child."))
def _offset(_p, params, children):
    return children[0] - float(params["distance"])


# ---------------------------------------------------------------------------
# Domain operators — these change the points before the child is evaluated,
# so they are handled by the compiler rather than by a value function.
# ---------------------------------------------------------------------------


DOMAIN_OPERATORS = {"mirror", "repeat_polar", "repeat_linear"}

REGISTRY["mirror"] = ProviderSpec(
    "mirror", "operator", 1, 1, required=("axis",), optional=("plane",),
    doc="Reflect the domain about a plane so one child covers both sides.",
)
REGISTRY["repeat_polar"] = ProviderSpec(
    "repeat_polar", "operator", 1, 1, required=("axis", "count"),
    optional=("phaseDeg",),
    doc="Fold the domain into one angular sector repeated `count` times.",
)
REGISTRY["repeat_linear"] = ProviderSpec(
    "repeat_linear", "operator", 1, 1, required=("axis", "spacing", "count"),
    doc="Repeat the child `count` times along an axis, centred on the origin.",
)


@provider(ProviderSpec("displace_gaussian_band", "operator", 1, 1,
                       required=("amount", "axis", "center", "sharpness"),
                       optional=("useAbs",), exact=False,
                       doc="Add a soft gaussian ridge/groove band to the child; "
                           "keeps the field continuous for shallow relief."))
def _displace_band(p, params, children):
    axis = _axis(params["axis"])
    coordinate = p[:, axis]
    if bool(params.get("useAbs", False)):
        coordinate = np.abs(coordinate)
    falloff = np.exp(-((coordinate - float(params["center"])) ** 2)
                     * float(params["sharpness"]))
    return children[0] + float(params["amount"]) * falloff


@provider(ProviderSpec("mesh_asset", "asset", 0, 0, required=("assetKey",),
                       exact=False,
                       doc="Signed field baked from an imported watertight "
                           "mesh; resolved through the asset provider table."))
def _mesh_asset(p, params, _children):
    resolver = params.get("_resolver")
    if resolver is None:
        raise RuntimeError(
            "mesh_asset requires an asset resolver; pass assets= to compile_node"
        )
    return resolver(params["assetKey"])(p)


# ---------------------------------------------------------------------------
# Compiler.
# ---------------------------------------------------------------------------


@dataclass
class CompileStats:
    nodes: int = 0
    providers_used: set = field(default_factory=set)


def _apply_domain(node_name: str, params: dict, points: np.ndarray) -> np.ndarray:
    if node_name == "mirror":
        axis = _axis(params["axis"])
        plane = float(params.get("plane", 0.0))
        q = points.copy()
        q[:, axis] = np.abs(q[:, axis] - plane) + plane
        return q
    if node_name == "repeat_polar":
        axis = _axis(params["axis"])
        count = int(params["count"])
        phase = np.radians(float(params.get("phaseDeg", 0.0)))
        plane = [i for i in range(3) if i != axis]
        q = points.copy()
        sector = 2.0 * np.pi / count
        theta = np.arctan2(q[:, plane[1]], q[:, plane[0]]) - phase
        radius = np.hypot(q[:, plane[0]], q[:, plane[1]])
        folded = np.mod(theta + sector * 0.5, sector) - sector * 0.5 + phase
        q[:, plane[0]] = radius * np.cos(folded)
        q[:, plane[1]] = radius * np.sin(folded)
        return q
    if node_name == "repeat_linear":
        axis = _axis(params["axis"])
        spacing = float(params["spacing"])
        count = int(params["count"])
        q = points.copy()
        span = spacing * (count - 1)
        shifted = q[:, axis] + span * 0.5
        index = np.clip(np.round(shifted / spacing), 0, count - 1)
        q[:, axis] = shifted - index * spacing
        return q
    raise ValueError(f"{node_name} is not a domain operator")


def compile_node(node: dict, assets: Callable[[str], Field] | None = None,
                 stats: CompileStats | None = None) -> Field:
    """Compile a provider tree into a callable signed-distance function."""
    if stats is None:
        stats = CompileStats()
    name = node["provider"]
    if name not in REGISTRY:
        raise ValueError(f"unknown geometry provider {name!r}")
    spec = REGISTRY[name]
    stats.nodes += 1
    stats.providers_used.add(name)

    params = dict(node.get("params", {}))
    if name == "mesh_asset":
        params["_resolver"] = assets
    child_nodes = node.get("children", [])
    children = [compile_node(c, assets, stats) for c in child_nodes]

    transform = node.get("transform")
    if transform:
        translate = _v3(transform.get("translate", (0.0, 0.0, 0.0)))
        rotation = euler_matrix(transform.get("rotateDeg", (0.0, 0.0, 0.0)))
        scale = float(transform.get("scale", 1.0))
        if scale <= 0.0:
            raise ValueError("transform.scale must be positive")
        inverse = rotation.T
    else:
        translate = None

    if name in DOMAIN_OPERATORS:
        child = children[0]

        def domain_field(points: np.ndarray) -> np.ndarray:
            q = points
            if translate is not None:
                q = (q - translate) @ inverse.T / scale
            value = child(_apply_domain(name, params, q))
            return value * scale if translate is not None else value

        return domain_field

    impl = _IMPL[name]

    def value_field(points: np.ndarray) -> np.ndarray:
        q = points
        if translate is not None:
            q = (q - translate) @ inverse.T / scale
        evaluated = [c(q) for c in children]
        value = impl(q, params, evaluated)
        return value * scale if translate is not None else value

    return value_field


def validate_node(node: dict, path: str = "geometryProvider") -> list[str]:
    """Structural validation of a provider tree; returns a list of problems."""
    problems: list[str] = []
    if not isinstance(node, dict):
        return [f"{path}: node must be an object"]
    name = node.get("provider")
    if name not in REGISTRY:
        return [f"{path}: unknown provider {name!r}"]
    spec = REGISTRY[name]
    params = node.get("params", {})
    if not isinstance(params, dict):
        problems.append(f"{path}.params: must be an object")
        params = {}
    for key in spec.required:
        if key not in params:
            problems.append(f"{path}.params: missing required {key!r}")
    allowed = set(spec.required) | set(spec.optional)
    for key in params:
        if key not in allowed:
            problems.append(f"{path}.params: unexpected {key!r} for {name!r}")
    children = node.get("children", [])
    if not isinstance(children, list):
        problems.append(f"{path}.children: must be a list")
        children = []
    if len(children) < spec.min_children:
        problems.append(
            f"{path}: {name!r} needs at least {spec.min_children} children"
        )
    if spec.max_children is not None and len(children) > spec.max_children:
        problems.append(
            f"{path}: {name!r} accepts at most {spec.max_children} children"
        )
    transform = node.get("transform")
    if transform is not None:
        if not isinstance(transform, dict):
            problems.append(f"{path}.transform: must be an object")
        else:
            for key in transform:
                if key not in ("translate", "rotateDeg", "scale"):
                    problems.append(f"{path}.transform: unexpected {key!r}")
    for index, child in enumerate(children):
        problems.extend(validate_node(child, f"{path}.children[{index}]"))
    return problems
