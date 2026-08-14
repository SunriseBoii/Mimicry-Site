"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CameraPreset, DecodedState, M31Manifest, ViewProfile } from "./m31-data";
import { visibleComponents } from "./m31-data";

export type DebugMode = "neutral" | "components" | "safe" | "occlusion" | "orientation" | "silhouette";
export interface SceneStats { fps: number; medianMs: number; p95Ms: number; drawCalls: number; triangles: number }

interface SceneProps {
  state: DecodedState;
  manifest: M31Manifest;
  cameraPreset: CameraPreset;
  profile: ViewProfile;
  debugMode: DebugMode;
  onStats?: (stats: SceneStats) => void;
  worldUpZ?: boolean;
}

const TEXTURE_SIZE = 128;

interface PresentationFrame { translate: [number, number, number]; scale: number }

function normalize(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...value) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross(first: [number, number, number], second: [number, number, number]): [number, number, number] {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0],
  ];
}

function baselinePresentationFrame(state: DecodedState, manifest: M31Manifest): PresentationFrame {
  if (state.entry.presentationFrame) return state.entry.presentationFrame;
  const center: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (let id = 0; id < state.entry.recordCount; id += 1) {
    if (state.status[id] !== 0) continue;
    center[0] += state.position[id * 3];
    center[1] += state.position[id * 3 + 1];
    center[2] += state.position[id * 3 + 2];
    count += 1;
  }
  center[0] /= Math.max(count, 1);
  center[1] /= Math.max(count, 1);
  center[2] /= Math.max(count, 1);
  const tanHalf = Math.tan(manifest.presentationContract.fovDegrees * Math.PI / 360);
  const cameras = Object.values(manifest.presentationContract.cameras);
  function maximumNdc(candidate: number) {
    let maximum = 0;
    for (const camera of cameras) {
      const forward = normalize([-camera[0], -camera[1], -camera[2]]);
      const right = normalize(cross(forward, [0, 0, 1]));
      const up = normalize(cross(right, forward));
      for (let id = 0; id < state.entry.recordCount; id += 1) {
        if (state.status[id] !== 0) continue;
        const relative: [number, number, number] = [
          (state.position[id * 3] - center[0]) * candidate - camera[0],
          (state.position[id * 3 + 1] - center[1]) * candidate - camera[1],
          (state.position[id * 3 + 2] - center[2]) * candidate - camera[2],
        ];
        const depth = Math.max(relative[0] * forward[0] + relative[1] * forward[1] + relative[2] * forward[2], 1e-9);
        const x = Math.abs((relative[0] * right[0] + relative[1] * right[1] + relative[2] * right[2]) / (depth * tanHalf));
        const y = Math.abs((relative[0] * up[0] + relative[1] * up[1] + relative[2] * up[2]) / (depth * tanHalf));
        maximum = Math.max(maximum, x, y);
      }
    }
    return maximum;
  }
  let low = 0;
  let high = 1.8;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) * .5;
    if (maximumNdc(middle) <= .8) low = middle;
    else high = middle;
  }
  return { translate: [-center[0], -center[1], -center[2]], scale: low };
}

function stateTexture(state: DecodedState, profile: ViewProfile, frame: PresentationFrame, kind: "position" | "meta" | "normal") {
  const data = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  const visible = visibleComponents(state.entry, profile);
  for (let id = 0; id < state.entry.recordCount; id += 1) {
    const offset = id * 4;
    if (kind === "position") {
      data[offset] = (state.position[id * 3] + frame.translate[0]) * frame.scale;
      data[offset + 1] = (state.position[id * 3 + 1] + frame.translate[1]) * frame.scale;
      data[offset + 2] = (state.position[id * 3 + 2] + frame.translate[2]) * frame.scale;
      data[offset + 3] = state.scale[id] * frame.scale;
    } else if (kind === "meta") {
      data[offset] = state.component[id];
      data[offset + 1] = state.shell[id];
      data[offset + 2] = state.status[id];
      data[offset + 3] = visible.has(state.component[id]) ? 1 : 0;
    } else {
      data[offset] = state.normal[id * 3];
      data[offset + 1] = state.normal[id * 3 + 1];
      data[offset + 2] = state.normal[id * 3 + 2];
    }
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
uniform sampler2D uPosition;
uniform sampler2D uMeta;
uniform sampler2D uNormal;
uniform int uDebug;
out vec3 vColor;
out float vShade;

vec3 hashColor(float value) { return 0.42 + 0.44 * cos(vec3(0.0, 2.1, 4.2) + value * 1.71); }

void main() {
  int id = gl_InstanceID;
  ivec2 uv = ivec2(id % 128, id / 128);
  vec4 point = texelFetch(uPosition, uv, 0);
  vec4 meta = texelFetch(uMeta, uv, 0);
  vec3 normal = normalize(texelFetch(uNormal, uv, 0).xyz + vec3(0.0001));
  float endpointVisible = (1.0 - step(0.45, meta.z)) * meta.w;
  vec3 up = abs(normal.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(up, normal));
  vec3 bitangent = cross(normal, tangent);
  vec3 local = (tangent * position.x + bitangent * position.y + normal * position.z) * point.w * endpointVisible;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point.xyz + local, 1.0);
  vColor = vec3(0.79, 0.81, 0.80);
  if (uDebug == 1 || uDebug == 3) vColor = hashColor(meta.x + 1.0);
  if (uDebug == 4) vColor = normal * 0.5 + 0.5;
  if (uDebug == 5) vColor = vec3(0.95);
  vShade = uDebug == 5 ? 1.0 : 0.52 + 0.48 * abs(normal.z);
}`;

const fragmentShader = `
precision highp float;
in vec3 vColor;
in float vShade;
out vec4 outColor;
void main() { outColor = vec4(vColor * vShade, 1.0); }`;

function CameraRig({ manifest, preset, worldUpZ = false }: { manifest: M31Manifest; preset: CameraPreset; worldUpZ?: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(...manifest.presentationContract.cameras[preset]);
    camera.up.set(0, worldUpZ ? 0 : 1, worldUpZ ? 1 : 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, manifest, preset, worldUpZ]);
  return null;
}

function StaticContent({ state, manifest, cameraPreset, profile, debugMode, onStats, worldUpZ }: SceneProps) {
  const { gl } = useThree();
  const stats = useRef({ started: 0, frames: 0, samples: [] as number[] });
  const frame = useMemo(() => baselinePresentationFrame(state, manifest), [manifest, state]);
  const textures = useMemo(() => ({
    position: stateTexture(state, profile, frame, "position"),
    meta: stateTexture(state, profile, frame, "meta"),
    normal: stateTexture(state, profile, frame, "normal"),
  }), [frame, profile, state]);
  const uniforms = useMemo(() => ({
    uPosition: { value: textures.position },
    uMeta: { value: textures.meta },
    uNormal: { value: textures.normal },
    uDebug: { value: ["neutral", "components", "safe", "occlusion", "orientation", "silhouette"].indexOf(debugMode) },
  }), [debugMode, textures]);
  const material = useMemo(() => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader, fragmentShader, uniforms }), [uniforms]);
  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.035, 0), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
    Object.values(textures).forEach((texture) => texture.dispose());
  }, [geometry, material, textures]);

  useFrame((_, delta) => {
    if (!onStats) return;
    const now = performance.now();
    if (!stats.current.started) stats.current.started = now;
    stats.current.frames += 1;
    stats.current.samples.push(delta * 1000);
    if (now - stats.current.started >= 900) {
      const samples = [...stats.current.samples].sort((a, b) => a - b);
      onStats({
        fps: Math.round(stats.current.frames * 1000 / (now - stats.current.started)),
        medianMs: Number((samples[Math.floor(samples.length * .5)] ?? 0).toFixed(2)),
        p95Ms: Number((samples[Math.floor(samples.length * .95)] ?? 0).toFixed(2)),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      stats.current = { started: now, frames: 0, samples: [] };
    }
  });

  return <>
    <CameraRig manifest={manifest} preset={cameraPreset} worldUpZ={worldUpZ} />
    <instancedMesh args={[geometry, material, state.entry.recordCount]} count={state.entry.recordCount} frustumCulled={false} />
  </>;
}

export function M31Scene(props: SceneProps) {
  return <Canvas
    gl={{ antialias: true, powerPreference: "high-performance" }}
    camera={{ fov: props.manifest.presentationContract.fovDegrees, near: 0.01, far: 100 }}
    dpr={[1, 1.5]}
  >
    <color attach="background" args={[props.debugMode === "silhouette" ? "#050606" : "#090b0c"]} />
    <StaticContent {...props} />
  </Canvas>;
}
