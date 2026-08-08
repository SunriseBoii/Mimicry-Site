"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { DecodedState } from "./m3-data";

export type DebugMode = "neutral" | "components" | "shells" | "zones" | "identity" | "reserve" | "trajectory";
export type CameraPreset = "canonical" | "opposite" | "side" | "top";

export interface SceneStats {
  fps: number;
  medianMs: number;
  p95Ms: number;
  drawCalls: number;
  triangles: number;
}

interface SceneProps {
  source: DecodedState;
  target: DecodedState;
  budget: number;
  progress: number;
  playing: boolean;
  direction: number;
  reducedMotion: boolean;
  debugMode: DebugMode;
  cameraPreset: CameraPreset;
  selectedId: number;
  onProgress: (value: number) => void;
  onStats: (value: SceneStats) => void;
}

const TEXTURE_SIZE = 128;

function stateTexture(state: DecodedState, kind: "position" | "meta" | "normal") {
  const data = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let id = 0; id < state.entry.recordCount; id += 1) {
    const offset = id * 4;
    if (kind === "position") {
      data[offset] = state.position[id * 3];
      data[offset + 1] = state.position[id * 3 + 1];
      data[offset + 2] = state.position[id * 3 + 2];
      data[offset + 3] = state.scale[id];
    } else if (kind === "meta") {
      data[offset] = state.component[id];
      data[offset + 1] = state.shell[id];
      data[offset + 2] = state.status[id];
      data[offset + 3] = state.flags[id] + state.density[id] / 512;
    } else {
      data[offset] = state.normal[id * 3];
      data[offset + 1] = state.normal[id * 3 + 1];
      data[offset + 2] = state.normal[id * 3 + 2];
      data[offset + 3] = 0;
    }
  }
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function routeTexture(source: DecodedState, target: DecodedState) {
  const data = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const axis = new THREE.Vector3(1, 0, 0);
  const delta = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const averageNormal = new THREE.Vector3();
  for (let id = 0; id < source.entry.recordCount; id += 1) {
    const p = id * 3;
    const out = id * 4;
    delta.set(
      target.position[p] - source.position[p],
      target.position[p + 1] - source.position[p + 1],
      target.position[p + 2] - source.position[p + 2],
    );
    averageNormal.set(
      source.normal[p] + target.normal[p],
      source.normal[p + 1] + target.normal[p + 1],
      source.normal[p + 2] + target.normal[p + 2],
    ).normalize();
    lateral.crossVectors(delta, axis);
    if (lateral.lengthSq() < 1e-10) {
      lateral.crossVectors(averageNormal, new THREE.Vector3(0, 1, 0));
    }
    lateral.normalize();
    const group = Math.min(source.transitionGroup[id], target.transitionGroup[id]);
    const amplitude = Math.min(0.36, 0.08 + delta.length() * 0.11) * (group % 2 ? -1 : 1);
    const normalBias = Math.min(0.12, delta.length() * 0.035);
    data[out] = lateral.x * amplitude + averageNormal.x * normalBias;
    data[out + 1] = lateral.y * amplitude + averageNormal.y * normalBias;
    data[out + 2] = lateral.z * amplitude + averageNormal.z * normalBias;
    data[out + 3] = ((id * 0.61803398875) % 1) * 0.08;
  }
  const texture = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const vertexShader = `
precision highp float;
precision highp sampler2D;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D uSource;
uniform sampler2D uTarget;
uniform sampler2D uSourceMeta;
uniform sampler2D uTargetMeta;
uniform sampler2D uSourceNormal;
uniform sampler2D uTargetNormal;
uniform sampler2D uRoute;
uniform float uProgress;
uniform float uBudget;
uniform float uSelected;
uniform int uDebug;
out vec3 vColor;
out float vShade;

vec3 hashColor(float value) {
  return 0.38 + 0.48 * cos(vec3(0.0, 2.1, 4.2) + value * 1.71);
}

void main() {
  int id = gl_InstanceID;
  ivec2 uv = ivec2(id % 128, id / 128);
  vec4 a = texelFetch(uSource, uv, 0);
  vec4 b = texelFetch(uTarget, uv, 0);
  vec4 ma = texelFetch(uSourceMeta, uv, 0);
  vec4 mb = texelFetch(uTargetMeta, uv, 0);
  vec3 na = texelFetch(uSourceNormal, uv, 0).xyz;
  vec3 nb = texelFetch(uTargetNormal, uv, 0).xyz;
  vec4 route = texelFetch(uRoute, uv, 0);
  float t = clamp(uProgress, 0.0, 1.0);
  float smoothT = t * t * t * (10.0 + t * (-15.0 + 6.0 * t));
  float hump = 64.0 * t * t * t * (1.0 - t) * (1.0 - t) * (1.0 - t);
  vec3 center = mix(a.xyz, b.xyz, smoothT) + route.xyz * hump;
  float visible = float(float(id) < uBudget);
  float sourceActive = 1.0 - step(0.45, ma.z);
  float targetActive = 1.0 - step(0.45, mb.z);
  float emerging = (1.0 - sourceActive) * targetActive;
  float immersing = sourceActive * (1.0 - targetActive);
  float activation = sourceActive * targetActive;
  activation += emerging * smoothstep(0.18 + route.w, 0.72 + route.w, t);
  activation += immersing * (1.0 - smoothstep(0.0, 0.82 - route.w, t));
  if (uDebug == 5) activation = 1.0;
  float selected = 1.0 + 1.7 * float(abs(float(id) - uSelected) < 0.5);
  float radius = mix(a.w, b.w, smoothT) * visible * activation * selected;
  vec3 normal = normalize(mix(na, nb, smoothT) + vec3(0.0001, 0.0002, 0.0003));
  vec3 up = abs(normal.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(up, normal));
  vec3 bitangent = cross(normal, tangent);
  vec3 local = (tangent * position.x + bitangent * position.y + normal * position.z) * radius;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + local, 1.0);
  float component = mix(ma.x, mb.x, smoothT);
  float shell = mix(ma.y, mb.y, smoothT);
  float packedFlags = mix(ma.w, mb.w, smoothT);
  float flags = floor(packedFlags + 0.001);
  float density = fract(packedFlags) * 2.0;
  vColor = vec3(0.76, 0.78, 0.77);
  if (uDebug == 1) vColor = hashColor(component + 1.0);
  if (uDebug == 2) vColor = hashColor(shell + 5.0);
  if (uDebug == 3) vColor = mix(vec3(0.18, 0.42, 0.86), vec3(0.98, 0.45, 0.15), clamp(flags / 7.0 + density * 0.25, 0.0, 1.0));
  if (uDebug == 4) vColor = hashColor(float(id) * 0.013);
  if (uDebug == 5) vColor = mix(vec3(0.96, 0.34, 0.42), vec3(0.26, 0.86, 0.56), max(sourceActive, targetActive));
  if (uDebug == 6) vColor = mix(vec3(0.22, 0.42, 0.94), vec3(0.98, 0.64, 0.18), hump);
  if (abs(float(id) - uSelected) < 0.5) vColor = vec3(1.0, 0.93, 0.2);
  vShade = 0.55 + 0.45 * abs(normal.z);
}`;

const fragmentShader = `
precision highp float;
in vec3 vColor;
in float vShade;
out vec4 outColor;
void main() { outColor = vec4(vColor * vShade, 1.0); }
`;

function CameraRig({ preset }: { preset: CameraPreset }) {
  const { camera } = useThree();
  useEffect(() => {
    const positions: Record<CameraPreset, [number, number, number]> = {
      canonical: [5.6, -6.4, 4.1],
      opposite: [-5.6, 6.4, 4.1],
      side: [0.0, -8.6, 1.2],
      top: [0.01, -0.01, 9.2],
    };
    camera.position.set(...positions[preset]);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, preset]);
  return null;
}

function M3Content(props: SceneProps) {
  const { gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const stats = useRef({ started: 0, frames: 0, samples: [] as number[] });
  const animatedProgress = useRef(props.progress);
  const animatedDirection = useRef(props.direction);
  const textures = useMemo(() => ({
    source: stateTexture(props.source, "position"),
    target: stateTexture(props.target, "position"),
    sourceMeta: stateTexture(props.source, "meta"),
    targetMeta: stateTexture(props.target, "meta"),
    sourceNormal: stateTexture(props.source, "normal"),
    targetNormal: stateTexture(props.target, "normal"),
    route: routeTexture(props.source, props.target),
  }), [props.source, props.target]);
  const uniformsRef = useRef({
    uSource: { value: textures.source },
    uTarget: { value: textures.target },
    uSourceMeta: { value: textures.sourceMeta },
    uTargetMeta: { value: textures.targetMeta },
    uSourceNormal: { value: textures.sourceNormal },
    uTargetNormal: { value: textures.targetNormal },
    uRoute: { value: textures.route },
    uProgress: { value: 0 },
    uBudget: { value: props.budget },
    uSelected: { value: props.selectedId },
    uDebug: { value: 0 },
  });
  const material = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader,
    fragmentShader,
    // Three needs stable mutable uniform objects outside React state.
    // eslint-disable-next-line react-hooks/refs
    uniforms: uniformsRef.current,
  }), []);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.035, 0), []);
  const trail = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const id = Math.min(props.selectedId, props.source.entry.recordCount - 1);
    const p = id * 3;
    const points = [];
    for (let step = 0; step <= 48; step += 1) {
      const t = step / 48;
      const smoothT = t ** 3 * (10 + t * (-15 + 6 * t));
      const hump = 64 * t ** 3 * (1 - t) ** 3;
      const routeData = textures.route.image.data as Float32Array;
      points.push(new THREE.Vector3(
        props.source.position[p] + (props.target.position[p] - props.source.position[p]) * smoothT + routeData[id * 4] * hump,
        props.source.position[p + 1] + (props.target.position[p + 1] - props.source.position[p + 1]) * smoothT + routeData[id * 4 + 1] * hump,
        props.source.position[p + 2] + (props.target.position[p + 2] - props.source.position[p + 2]) * smoothT + routeData[id * 4 + 2] * hump,
      ));
    }
    geometry.setFromPoints(points);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe34d, transparent: true, opacity: 0.82 }));
  }, [props.selectedId, props.source, props.target, textures.route]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    trail.geometry.dispose();
    (trail.material as THREE.Material).dispose();
    Object.values(textures).forEach((texture) => texture.dispose());
  }, [geometry, material, trail, textures]);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    uniforms.uSource.value = textures.source;
    uniforms.uTarget.value = textures.target;
    uniforms.uSourceMeta.value = textures.sourceMeta;
    uniforms.uTargetMeta.value = textures.targetMeta;
    uniforms.uSourceNormal.value = textures.sourceNormal;
    uniforms.uTargetNormal.value = textures.targetNormal;
    uniforms.uRoute.value = textures.route;
    uniforms.uBudget.value = props.budget;
    uniforms.uSelected.value = props.selectedId;
    uniforms.uDebug.value = ["neutral", "components", "shells", "zones", "identity", "reserve", "trajectory"].indexOf(props.debugMode);
  }, [textures, props.budget, props.selectedId, props.debugMode]);

  useEffect(() => {
    animatedProgress.current = props.progress;
  }, [props.progress]);

  useEffect(() => {
    animatedDirection.current = props.direction;
  }, [props.direction]);

  useFrame((state, delta) => {
    if (props.playing && !props.reducedMotion) {
      const next = animatedProgress.current + (delta / 1.7) * animatedDirection.current;
      if (next >= 1 || next <= 0) animatedDirection.current *= -1;
      animatedProgress.current = THREE.MathUtils.clamp(next, 0, 1);
      props.onProgress(animatedProgress.current);
    }
    uniformsRef.current.uProgress.value = props.reducedMotion ? Math.round(animatedProgress.current) : animatedProgress.current;
    if (group.current) {
      group.current.rotation.y = props.reducedMotion ? 0 : 0.025 * Math.sin(state.clock.elapsedTime * 0.25);
    }
    const now = performance.now();
    const window = stats.current;
    if (!window.started) window.started = now;
    window.frames += 1;
    window.samples.push(delta * 1000);
    if (now - window.started >= 750) {
      const sorted = [...window.samples].sort((a, b) => a - b);
      props.onStats({
        fps: Math.round((window.frames * 1000) / (now - window.started)),
        medianMs: Number(sorted[Math.floor(sorted.length * 0.5)]?.toFixed(2) ?? 0),
        p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)]?.toFixed(2) ?? 0),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      window.started = now;
      window.frames = 0;
      window.samples = [];
    }
  });

  return (
    <>
      <CameraRig preset={props.cameraPreset} />
      <group ref={group}>
        <instancedMesh
          args={[geometry, material, props.source.entry.recordCount]}
          count={Math.min(props.budget, props.source.entry.recordCount)}
          frustumCulled={false}
        />
        {props.debugMode === "trajectory" ? <primitive object={trail} /> : null}
      </group>
    </>
  );
}

export function M3Scene(props: SceneProps) {
  return (
    <Canvas gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ fov: 33, near: 0.01, far: 100 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#090b0c"]} />
      <M3Content {...props} />
    </Canvas>
  );
}
