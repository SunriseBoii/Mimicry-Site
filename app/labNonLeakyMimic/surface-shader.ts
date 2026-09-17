import { FIELD_HALF, FIELD_SIZE, MORPH_BRIDGE } from "./surface-field";

export const surfaceVertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const surfaceFragment = `
precision highp sampler3D;
uniform sampler3D uSource;
uniform sampler3D uTarget;
uniform float uProgress;
uniform float uDark;
uniform float uDensity;
uniform float uRelief;
uniform float uZoom;
uniform float uAspect;
uniform float uMask;
uniform mat3 uRotation;
uniform vec3 uPaletteA[7];
uniform vec3 uPaletteB[7];
uniform int uCountA;
uniform int uCountB;
varying vec2 vUv;
const float H = ${FIELD_HALF.toFixed(6)};
const float N = ${FIELD_SIZE.toFixed(1)};
out vec4 outColor;

float field(vec3 p) {
  vec3 uvw = (p / (2. * H) + .5) * ((N - 1.) / N) + .5 / N;
  float a = texture(uSource, uvw).r;
  float b = texture(uTarget, uvw).r;
  float t = uProgress;
  // A small volume bridge keeps the transition cohesive; endpoints are exact.
  float d = mix(a, b, t) - ${MORPH_BRIDGE.toFixed(4)} * 4. * t * (1. - t);
  // A common positive boundary keeps every intermediate isosurface closed.
  return max(d, max(max(abs(p.x), abs(p.y)), abs(p.z)) - (H - .08));
}
vec3 gradient(vec3 p) {
  vec2 e = vec2(.008, 0.);
  return normalize(vec3(field(p + e.xyy) - field(p - e.xyy),
    field(p + e.yxy) - field(p - e.yxy), field(p + e.yyx) - field(p - e.yyx)));
}
float diamond(vec2 uv) {
  // The skew lattice tiles the entire plane. Its edge height is shared (zero).
  vec2 q = vec2(uv.x + uv.y * .72, uv.x - uv.y * .72);
  vec2 cell = abs(fract(q) - .5) * 2.;
  return 1. - max(cell.x, cell.y);
}
float relief(vec3 p, vec3 weights) {
  p *= uDensity;
  return dot(vec3(diamond(p.yz), diamond(p.xz), diamond(p.xy)), weights);
}
vec3 palette(vec3 p, bool target) {
  int count = target ? uCountB : uCountA;
  float s = fract(dot(p, vec3(.12, .16, .09)) + .47) * float(count);
  int i = int(floor(s));
  int j = (i + 1) % count;
  return mix(target ? uPaletteB[i] : uPaletteA[i], target ? uPaletteB[j] : uPaletteA[j], smoothstep(.72, 1., fract(s)));
}
void main() {
  vec2 screen = (vUv * 2. - 1.) * vec2(uAspect, 1.);
  vec3 ro = uRotation * vec3(0., 0., 7.8 / uZoom);
  vec3 rd = uRotation * normalize(vec3(screen * .31, -1.));
  vec3 inv = 1. / rd;
  vec3 t0 = (-vec3(H) - ro) * inv, t1 = (vec3(H) - ro) * inv;
  vec3 lo = min(t0, t1), hi = max(t0, t1);
  float nearT = max(max(lo.x, lo.y), lo.z);
  float farT = min(min(hi.x, hi.y), hi.z);
  if (farT < max(nearT, 0.)) discard;
  float travel = max(nearT, 0.);
  vec3 p = ro + rd * travel;
  bool hit = false;
  for (int i = 0; i < 420; i++) {
    p = ro + rd * travel;
    float distance = field(p);
    if (distance < .0015) { hit = true; break; }
    // Capped steps cannot jump across the thin closed shell.
    travel += clamp(distance * .48, .001, .038);
    if (travel > farT) break;
  }
  if (!hit) discard;
  if (uMask > .5) { outColor = vec4(1., 1., 1., 1.); return; }
  vec3 baseN = gradient(p);
  vec3 weights = pow(abs(baseN), vec3(12.));
  weights /= max(dot(weights, vec3(1.)), .0001);
  float e = .0012;
  vec3 bump = vec3(relief(p + vec3(e,0,0), weights) - relief(p - vec3(e,0,0), weights),
    relief(p + vec3(0,e,0), weights) - relief(p - vec3(0,e,0), weights),
    relief(p + vec3(0,0,e), weights) - relief(p - vec3(0,0,e), weights)) / (2. * e);
  vec3 n = normalize(baseN - (bump - baseN * dot(bump, baseN)) * uRelief / uDensity);
  vec3 view = -rd;
  vec3 key = normalize(uRotation * vec3(-.55, .8, 1.5));
  vec3 fill = normalize(uRotation * vec3(.8, -.2, 1.));
  vec3 pigment = mix(palette(p, false), palette(p, true), uProgress);
  float band = .32 + .68 * smoothstep(.0, .7, sin(p.z * 1.7 + p.y * .8) * .5 + .5);
  vec3 base = mix(mix(vec3(.77, .8, .81), vec3(.075, .09, .11), uDark), pigment, band * mix(.52, .68, uDark));
  float diffuse = max(dot(n,key), 0.) * .66 + max(dot(n,fill), 0.) * .2;
  float spec = pow(max(dot(n, normalize(view + key)), 0.), mix(65., 100., uDark));
  float rim = pow(1. - max(dot(n,view), 0.), 3.);
  float ridge = relief(p, weights);
  vec3 color = base * (.29 + diffuse) * mix(.74, 1.05, smoothstep(.0,.2,ridge));
  color += vec3(.8, .9, 1.) * spec * .8 + pigment * rim * .23;
  color = color / (color + vec3(.55));
  outColor = vec4(pow(color, vec3(1. / 2.2)), 1.);
}
`;
