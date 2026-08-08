"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import {
  SCALE_COUNT,
  sampleTimeline,
  type DecodedRows,
  type DecodedStatics,
  type Manifest,
} from "./matter-skin-data";

export type DebugMode = "none" | "components" | "reserve";

export interface SceneStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

export interface MatterSkinSceneProps {
  manifest: Manifest;
  rows: DecodedRows;
  statics: DecodedStatics;
  progressRef: MutableRefObject<number>;
  playingRef: MutableRefObject<boolean>;
  speedRef: MutableRefObject<number>;
  debugMode: DebugMode;
  reducedMotion: boolean;
  cameraResetToken: number;
  onProgressChange: (progress: number) => void;
  onStats: (stats: SceneStats) => void;
}

const CANONICAL_CAMERA = new THREE.Vector3(4.9, 3.1, 7.4);

interface SkinUniforms {
  uTexPos: { value: THREE.DataTexture | null };
  uTexNrm: { value: THREE.DataTexture | null };
  uTexColor: { value: THREE.DataTexture | null };
  uRowA: { value: number };
  uRowB: { value: number };
  uMix: { value: number };
  uColorRowA: { value: number };
  uColorRowB: { value: number };
  uColorMix: { value: number };
  uPlateRadius: { value: number };
  uMatterLayer: { value: number };
  uDebugMode: { value: number };
  uTime: { value: number };
  [key: string]: { value: unknown };
}

function buildTextures(rows: DecodedRows, statics: DecodedStatics) {
  const texPos = new THREE.DataTexture(
    rows.positionScale,
    SCALE_COUNT,
    rows.rows,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texPos.needsUpdate = true;
  texPos.minFilter = texPos.magFilter = THREE.NearestFilter;
  const texNrm = new THREE.DataTexture(
    rows.normalState,
    SCALE_COUNT,
    rows.rows,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texNrm.needsUpdate = true;
  texNrm.minFilter = texNrm.magFilter = THREE.NearestFilter;
  const texColor = new THREE.DataTexture(
    statics.colors,
    SCALE_COUNT,
    3,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texColor.needsUpdate = true;
  texColor.minFilter = texColor.magFilter = THREE.NearestFilter;
  return { texPos, texNrm, texColor };
}

const VERTEX_PATCH = /* glsl */ `
attribute float aId;
attribute float aRot;
attribute float aComponent;
uniform sampler2D uTexPos;
uniform sampler2D uTexNrm;
uniform sampler2D uTexColor;
uniform float uRowA;
uniform float uRowB;
uniform float uMix;
uniform float uColorRowA;
uniform float uColorRowB;
uniform float uColorMix;
uniform float uPlateRadius;
uniform float uMatterLayer;
uniform float uTime;
varying vec4 vTint;      // rgb + chroma
varying float vState;
varying float vComponent;

vec3 psWorld;
vec3 psNormal;

vec3 idleWobble(vec3 p, float phase) {
  // Micro-breath ~10s; rotational sway 2-4 degrees handled at group level.
  float breath = 1.0 + 0.006 * sin(uTime * 0.628318 + phase);
  return p * breath;
}
`;

const VERTEX_TRANSFORM = /* glsl */ `
int id = int(aId);
vec4 rowA_ps = texelFetch(uTexPos, ivec2(id, int(uRowA)), 0);
vec4 rowB_ps = texelFetch(uTexPos, ivec2(id, int(uRowB)), 0);
vec4 rowA_ns = texelFetch(uTexNrm, ivec2(id, int(uRowA)), 0);
vec4 rowB_ns = texelFetch(uTexNrm, ivec2(id, int(uRowB)), 0);

vec3 center = mix(rowA_ps.xyz, rowB_ps.xyz, uMix);
float plateScale = mix(rowA_ps.w, rowB_ps.w, uMix);
vec3 skinNormal = normalize(mix(rowA_ns.xyz, rowB_ns.xyz, uMix));
float stateFlag = uMix < 0.5 ? rowA_ns.w : rowB_ns.w;

vec4 colA = texelFetch(uTexColor, ivec2(id, int(uColorRowA)), 0);
vec4 colB = texelFetch(uTexColor, ivec2(id, int(uColorRowB)), 0);
vTint = mix(colA, colB, uColorMix);
vState = stateFlag;
vComponent = aComponent;

// Local frame around the skin normal, rotated by the per-id angle.
vec3 helper = abs(skinNormal.y) < 0.94 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
vec3 tangent = normalize(cross(helper, skinNormal));
vec3 bitangent = cross(skinNormal, tangent);
float ca = cos(aRot);
float sa = sin(aRot);
vec3 rotT = tangent * ca + bitangent * sa;
vec3 rotB = -tangent * sa + bitangent * ca;

float radius = uPlateRadius * plateScale;
float inset = 0.0;
if (uMatterLayer > 0.5) {
  radius *= 1.75;
  inset = uPlateRadius * 0.9;
}
if (stateFlag > 1.5) {
  radius *= 0.5; // reserve scales fold up under the skin
}

psWorld = idleWobble(center, aRot) - skinNormal * inset
  + (rotT * position.x + rotB * position.y) * radius;

psNormal = normalize(skinNormal + rotT * position.x * 0.30 + rotB * position.y * 0.30);
`;

const FRAGMENT_PATCH = /* glsl */ `
uniform float uDebugMode;
uniform float uMatterLayer;
varying vec4 vTint;
varying float vState;
varying float vComponent;
`;

const FRAGMENT_COLOR = /* glsl */ `
if (uMatterLayer < 0.5) {
  float chroma = vTint.a;
  diffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb, chroma * 0.88);
  if (uDebugMode > 0.5 && uDebugMode < 1.5) {
    vec3 compColor = vComponent < 0.5 ? vec3(0.30, 0.62, 1.0) : vec3(1.0, 0.55, 0.20);
    diffuseColor.rgb = mix(vec3(0.10), compColor, 0.9);
  } else if (uDebugMode > 1.5) {
    vec3 stateColor = vState < 0.5
      ? vec3(0.55, 0.58, 0.55)
      : (vState < 1.5 ? vec3(1.0, 0.78, 0.25) : vec3(1.0, 0.25, 0.35));
    diffuseColor.rgb = stateColor;
  }
}
`;

function makeSkinMaterial(
  uniforms: SkinUniforms,
  matterLayer: boolean,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(
    matterLayer
      ? { color: "#101216", roughness: 0.62, metalness: 0.25 }
      : {
          color: "#e9e3d8",
          roughness: 0.36,
          metalness: 0.12,
          emissive: "#1a1611",
          emissiveIntensity: 0.06,
        },
  );
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      uMatterLayer: { value: matterLayer ? 1 : 0 },
    });
    // three's chunk order runs beginnormal_vertex before begin_vertex, so
    // all texture fetching and placement happens there; begin_vertex only
    // consumes the precomputed globals.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PATCH}`)
      .replace(
        "#include <beginnormal_vertex>",
        `${VERTEX_TRANSFORM}\nvec3 objectNormal = psNormal;`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = psWorld;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PATCH}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${FRAGMENT_COLOR}`,
      );
  };
  material.customProgramCacheKey = () =>
    `ps03m-skin-${matterLayer ? "matter" : "skin"}-v1`;
  return material;
}

function makeInstancedMesh(
  material: THREE.MeshStandardMaterial,
  statics: DecodedStatics,
): THREE.InstancedMesh {
  const geometry = new THREE.CircleGeometry(1, 6);
  const ids = new Float32Array(SCALE_COUNT);
  const comps = new Float32Array(SCALE_COUNT);
  for (let i = 0; i < SCALE_COUNT; i += 1) {
    ids[i] = i;
    comps[i] = statics.component[i];
  }
  geometry.setAttribute("aId", new THREE.InstancedBufferAttribute(ids, 1));
  geometry.setAttribute(
    "aRot",
    new THREE.InstancedBufferAttribute(statics.rotation, 1),
  );
  geometry.setAttribute(
    "aComponent",
    new THREE.InstancedBufferAttribute(comps, 1),
  );

  const mesh = new THREE.InstancedMesh(geometry, material, SCALE_COUNT);
  // All placement happens in the vertex shader from DataTextures; identity
  // instance matrices stay untouched and culling is disabled because the
  // shader moves instances far from the origin.
  mesh.frustumCulled = false;
  return mesh;
}

function SceneContent({
  manifest,
  rows,
  statics,
  progressRef,
  playingRef,
  speedRef,
  debugMode,
  reducedMotion,
  onProgressChange,
  onStats,
}: MatterSkinSceneProps) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const statsWindow = useRef({ last: 0, frames: 0, accum: 0 });

  // Uniform objects live in a ref: three mutates .value at render time,
  // which must stay outside React's immutable data flow.
  const uniformsRef = useRef<SkinUniforms>({
    uTexPos: { value: null },
    uTexNrm: { value: null },
    uTexColor: { value: null },
    uRowA: { value: 0 },
    uRowB: { value: 0 },
    uMix: { value: 0 },
    uColorRowA: { value: 0 },
    uColorRowB: { value: 0 },
    uColorMix: { value: 0 },
    uPlateRadius: { value: 0.02 },
    uMatterLayer: { value: 0 },
    uDebugMode: { value: 0 },
    uTime: { value: 0 },
  });

  const { texPos, texNrm, texColor } = useMemo(
    () => buildTextures(rows, statics),
    [rows, statics],
  );

  const meshes = useMemo(() => {
    // three.js needs the live uniform objects at shader-compile time; this
    // imperative interop is the sanctioned escape hatch for R3F materials.
    // eslint-disable-next-line react-hooks/refs
    const skinMaterial = makeSkinMaterial(uniformsRef.current, false);
    // eslint-disable-next-line react-hooks/refs
    const matterMaterial = makeSkinMaterial(uniformsRef.current, true);
    const skin = makeInstancedMesh(skinMaterial, statics);
    const matter = makeInstancedMesh(matterMaterial, statics);
    matter.renderOrder = 0;
    skin.renderOrder = 1;
    return { skin, matter, skinMaterial, matterMaterial };
  }, [statics]);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    uniforms.uTexPos.value = texPos;
    uniforms.uTexNrm.value = texNrm;
    uniforms.uTexColor.value = texColor;
    uniforms.uPlateRadius.value = manifest.plate_radius;
  }, [texPos, texNrm, texColor, manifest.plate_radius]);

  useEffect(() => {
    return () => {
      meshes.skin.geometry.dispose();
      meshes.matter.geometry.dispose();
      meshes.skinMaterial.dispose();
      meshes.matterMaterial.dispose();
      texPos.dispose();
      texNrm.dispose();
      texColor.dispose();
    };
  }, [meshes, texPos, texNrm, texColor]);

  useEffect(() => {
    uniformsRef.current.uDebugMode.value =
      debugMode === "components" ? 1 : debugMode === "reserve" ? 2 : 0;
  }, [debugMode]);

  useFrame((state, delta) => {
    const uniforms = uniformsRef.current;
    if (playingRef.current && !reducedMotion) {
      progressRef.current =
        (progressRef.current + delta * speedRef.current) % 3;
      onProgressChange(progressRef.current);
    }
    const sample = sampleTimeline(manifest, progressRef.current);
    uniforms.uRowA.value = sample.rowA;
    uniforms.uRowB.value = sample.rowB;
    uniforms.uMix.value = reducedMotion
      ? Math.round(sample.mix)
      : sample.mix;
    uniforms.uColorRowA.value = sample.colorRowA;
    uniforms.uColorRowB.value = sample.colorRowB;
    uniforms.uColorMix.value = sample.colorMix;
    uniforms.uTime.value = reducedMotion ? 0 : state.clock.elapsedTime;

    // Idle sway 2-4 degrees on the dominant axis, no full rotation.
    if (groupRef.current) {
      const t = reducedMotion ? 0 : state.clock.elapsedTime;
      groupRef.current.rotation.y = 0.05 * Math.sin(t * 0.21);
      groupRef.current.rotation.x = 0.02 * Math.sin(t * 0.13 + 1.7);
    }

    // Stats: 500 ms window.
    const w = statsWindow.current;
    const now = performance.now();
    if (w.last === 0) w.last = now;
    w.frames += 1;
    w.accum += delta * 1000;
    if (now - w.last >= 500) {
      onStats({
        fps: Math.round((w.frames / (now - w.last)) * 1000),
        frameMs: w.frames ? +(w.accum / w.frames).toFixed(2) : 0,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      w.last = now;
      w.frames = 0;
      w.accum = 0;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={meshes.matter} />
      <primitive object={meshes.skin} />
    </group>
  );
}

function CameraRig({
  scrollEnabled,
  cameraResetToken,
}: {
  scrollEnabled: boolean;
  cameraResetToken: number;
}) {
  const { camera, gl } = useThree();
  const drag = useRef<{ x: number; y: number } | null>(null);
  const spherical = useRef(
    new THREE.Spherical().setFromVector3(CANONICAL_CAMERA.clone()),
  );

  useEffect(() => {
    spherical.current.setFromVector3(CANONICAL_CAMERA.clone());
    camera.position.copy(CANONICAL_CAMERA);
    camera.lookAt(0, 0.4, 0);
  }, [camera, cameraResetToken]);

  useEffect(() => {
    const dom = gl.domElement;
    const onDown = (event: PointerEvent) => {
      drag.current = { x: event.clientX, y: event.clientY };
      dom.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!drag.current) return;
      const dx = (event.clientX - drag.current.x) / dom.clientWidth;
      const dy = (event.clientY - drag.current.y) / dom.clientHeight;
      drag.current = { x: event.clientX, y: event.clientY };
      const s = spherical.current;
      s.theta -= dx * Math.PI * 1.6;
      s.phi = THREE.MathUtils.clamp(s.phi - dy * Math.PI, 0.15, Math.PI - 0.15);
      camera.position.setFromSpherical(s);
      camera.lookAt(0, 0.4, 0);
    };
    const onUp = () => {
      drag.current = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (scrollEnabled) return; // scrubbing owns the wheel
      event.preventDefault();
      const s = spherical.current;
      s.radius = THREE.MathUtils.clamp(
        s.radius * (1 + Math.sign(event.deltaY) * 0.08),
        3.2,
        18,
      );
      camera.position.setFromSpherical(s);
      camera.lookAt(0, 0.4, 0);
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [camera, gl, scrollEnabled]);

  return null;
}

export function MatterSkinScene(
  props: MatterSkinSceneProps & { scrollEnabled: boolean },
) {
  return (
    <Canvas
      camera={{ position: CANONICAL_CAMERA.toArray(), fov: 36, near: 0.1, far: 60 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#101114"]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight color="#f1f4ff" groundColor="#0a0b0c" intensity={1.0} />
      <directionalLight position={[5, 7, 6]} color="#f7f8ff" intensity={3.6} />
      <directionalLight position={[-6, 2, -3]} color="#7a8ca8" intensity={1.4} />
      <SceneContent {...props} />
      <CameraRig
        scrollEnabled={props.scrollEnabled}
        cameraResetToken={props.cameraResetToken}
      />
    </Canvas>
  );
}
