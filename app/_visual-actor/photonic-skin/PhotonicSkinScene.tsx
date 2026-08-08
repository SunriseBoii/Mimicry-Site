"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";
import type { VisualActorProps } from "../types";
import {
  CORE_COMPETENCE_COLORS,
  PHOTONIC_ACTIVE_ZONE_RATIO,
  expandPalette,
  getTransitionPolicy,
  resolvePhotonicPresentation,
  type PrototypeMorph,
} from "../visual-actor-state";

const MORPH_ORDER: readonly Exclude<PrototypeMorph, "mimic-core">[] = [
  "aperture",
  "responsive-field",
  "convergence",
  "approach",
];

type SceneProps = Pick<VisualActorProps, "state" | "theme" | "motionMode">;

interface PhotonicUniforms {
  uActiveCoverage: { value: number };
  uPaletteMix: { value: number };
  uReveal: { value: number };
  uPrevIntensity: { value: number };
  uNextIntensity: { value: number };
  uPrevColors: { value: THREE.Color[] };
  uNextColors: { value: THREE.Color[] };
}

interface TransitionSnapshot {
  startTime: number;
  durationMs: number;
  canMorphGeometry: boolean;
  startInfluences: number[];
  targetInfluences: number[];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const normalized = clamp01((value - edge0) / (edge1 - edge0));
  return normalized * normalized * (3 - 2 * normalized);
};

function deformPrototypePoint(
  original: THREE.Vector3,
  morph: PrototypeMorph,
): THREE.Vector3 {
  const u = (original.x + 1) * 0.5;
  const rearWeight = 1.22 - 0.68 * u ** 1.55;
  const middleWeight = Math.exp(-original.x * original.x * 1.65);
  const fold = Math.sin(original.z * 3.1 + original.x * 1.8);
  const point = new THREE.Vector3(
    original.x * 2.05 + 0.1 * original.y * original.y - 0.12,
    original.y * rearWeight + fold * middleWeight * 0.09 + 0.07 * original.z,
    original.z * (rearWeight * 0.88) + 0.1 * original.y * (1 - u),
  );

  if (morph === "aperture") {
    const opening = middleWeight * (0.38 + Math.abs(original.z) * 0.34);
    point.y += Math.sign(original.y || 1) * opening * 0.2;
    point.z *= 1 + middleWeight * 0.18;
    point.x += 0.08 * original.z * original.z;
  }

  if (morph === "responsive-field") {
    const field =
      Math.sin(original.y * 8 + original.z * 5 - original.x * 3) *
      middleWeight *
      0.075;
    point.y += original.y * field;
    point.z += original.z * field + 0.055 * Math.sin(original.x * 7);
    point.x += u * 0.13;
  }

  if (morph === "convergence") {
    const convergence = 1 - middleWeight * 0.22;
    point.y *= convergence;
    point.z *= convergence;
    point.x += 0.16 * u - 0.08 * (1 - u);
    point.y += 0.12 * Math.sin(original.z * 2.4) * (1 - u);
  }

  if (morph === "approach") {
    const approach = middleWeight * 0.14;
    point.y -= Math.sign(original.y || 1) * approach;
    point.z += Math.sign(original.y || 1) * approach * 0.55;
    point.x += 0.06 * Math.cos(original.z * Math.PI);
  }

  return point;
}

function normalsForPositions(
  positions: THREE.BufferAttribute,
): THREE.BufferAttribute {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions.clone());
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal").clone();
  geometry.dispose();
  return normals;
}

/**
 * Temporary PS-01 asset: one continuous folded shell plus four morph targets.
 * The master Blender mesh will replace this factory without changing callers.
 */
function createPrototypeGeometry(): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(1, 4);
  const geometry = source.index ? source.toNonIndexed() : source;
  const sourcePosition = geometry.getAttribute("position");
  const original = new THREE.Vector3();
  const basePositions = new Float32Array(sourcePosition.count * 3);
  const masks = new Float32Array(sourcePosition.count);
  const slots = new Float32Array(sourcePosition.count);
  const morphArrays = MORPH_ORDER.map(
    () => new Float32Array(sourcePosition.count * 3),
  );

  for (let index = 0; index < sourcePosition.count; index += 1) {
    original.fromBufferAttribute(sourcePosition, index).normalize();
    const base = deformPrototypePoint(original, "mimic-core");
    base.toArray(basePositions, index * 3);

    const maskRank = clamp01(
      0.5 +
        original.y * 0.25 -
        original.z * 0.13 +
        Math.sin(original.x * 5.3 + original.z * 3.7) * 0.1,
    );
    masks[index] = maskRank;
    slots[index] =
      (Math.atan2(original.y, original.z) + Math.PI) / (Math.PI * 2);

    MORPH_ORDER.forEach((morph, morphIndex) => {
      deformPrototypePoint(original, morph).toArray(
        morphArrays[morphIndex],
        index * 3,
      );
    });
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(basePositions, 3));
  geometry.setAttribute("photonicMask", new THREE.BufferAttribute(masks, 1));
  geometry.setAttribute("photonicSlot", new THREE.BufferAttribute(slots, 1));
  geometry.morphAttributes.position = morphArrays.map(
    (array) => new THREE.BufferAttribute(array, 3),
  );
  geometry.morphAttributes.normal = geometry.morphAttributes.position.map(
    (positions) => normalsForPositions(positions as THREE.BufferAttribute),
  );
  geometry.morphTargetsRelative = false;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  source.dispose();

  return geometry;
}

const paletteToColors = (palette: readonly `#${string}`[]) =>
  expandPalette(palette).map((color) => new THREE.Color(color));

const blendPalettes = (
  previous: readonly THREE.Color[],
  next: readonly THREE.Color[],
  progress: number,
) =>
  previous.map((color, index) =>
    color.clone().lerp(next[index] ?? color, progress),
  );

const influenceTarget = (morph: PrototypeMorph) =>
  MORPH_ORDER.map((candidate) => (candidate === morph ? 1 : 0));

function usePhotonicMaterial(
  theme: SceneProps["theme"],
  uniformsRef: RefObject<PhotonicUniforms>,
) {
  return useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({
      color: theme === "dark" ? "#202329" : "#e9e3d8",
      roughness: theme === "dark" ? 0.3 : 0.38,
      metalness: theme === "dark" ? 0.34 : 0.08,
      clearcoat: 0.28,
      clearcoatRoughness: 0.42,
      sheen: 0.16,
      sheenColor: new THREE.Color(theme === "dark" ? "#747b85" : "#fff7e8"),
    });

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniformsRef.current);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
attribute float photonicMask;
attribute float photonicSlot;
varying float vPhotonicMask;
varying float vPhotonicSlot;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vPhotonicMask = photonicMask;
vPhotonicSlot = photonicSlot;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying float vPhotonicMask;
varying float vPhotonicSlot;
uniform float uActiveCoverage;
uniform float uPaletteMix;
uniform float uReveal;
uniform float uPrevIntensity;
uniform float uNextIntensity;
uniform vec3 uPrevColors[7];
uniform vec3 uNextColors[7];

vec3 photonicPrev(float slot) {
  if (slot < 0.142857) return uPrevColors[0];
  if (slot < 0.285714) return uPrevColors[1];
  if (slot < 0.428571) return uPrevColors[2];
  if (slot < 0.571428) return uPrevColors[3];
  if (slot < 0.714285) return uPrevColors[4];
  if (slot < 0.857142) return uPrevColors[5];
  return uPrevColors[6];
}

vec3 photonicNext(float slot) {
  if (slot < 0.142857) return uNextColors[0];
  if (slot < 0.285714) return uNextColors[1];
  if (slot < 0.428571) return uNextColors[2];
  if (slot < 0.571428) return uNextColors[3];
  if (slot < 0.714285) return uNextColors[4];
  if (slot < 0.857142) return uNextColors[5];
  return uNextColors[6];
}`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
float photonicThreshold = 1.0 - clamp(uActiveCoverage, 0.18, 0.52);
float photonicZone = smoothstep(
  photonicThreshold - 0.045,
  photonicThreshold + 0.045,
  vPhotonicMask
);
float grazing = pow(
  1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0),
  2.0
);
float microFacet = 0.84 + 0.16 * sin(
  (vPhotonicSlot * 89.0 + vPhotonicMask * 47.0) * 6.283185
);
float opticalSlot = fract(
  vPhotonicSlot * 1.42 + vPhotonicMask * 0.58 + grazing * 0.024
);
vec3 reflectedColor = mix(
  photonicPrev(opticalSlot),
  photonicNext(opticalSlot),
  uPaletteMix
);
float stateIntensity = mix(uPrevIntensity, uNextIntensity, uPaletteMix);
float opticalResponse = photonicZone * uReveal * stateIntensity
  * (0.48 + grazing * 0.52) * microFacet;
diffuseColor.rgb = mix(diffuseColor.rgb, reflectedColor, opticalResponse * 0.88);`,
        );

    };

    material.customProgramCacheKey = () => "mimicry-photonic-skin-ps01-v1";
    return material;
  }, [theme, uniformsRef]);
}

function PhotonicPrototype({
  state,
  theme,
  motionMode,
  active,
  systemPrefersReducedMotion,
}: SceneProps & { active: boolean; systemPrefersReducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const transitionRef = useRef<TransitionSnapshot | null>(null);
  const { invalidate, viewport } = useThree();
  const presentation = useMemo(
    () => resolvePhotonicPresentation(state),
    [state],
  );
  const geometry = useMemo(() => createPrototypeGeometry(), []);
  const initialPalette = useMemo(
    () => paletteToColors([CORE_COMPETENCE_COLORS.content]),
    [],
  );
  const uniformsRef = useRef<PhotonicUniforms>({
      uActiveCoverage: { value: PHOTONIC_ACTIVE_ZONE_RATIO },
      uPaletteMix: { value: 1 },
      uReveal: { value: 1 },
      uPrevIntensity: { value: 0.82 },
      uNextIntensity: { value: 0.82 },
      uPrevColors: { value: initialPalette.map((color) => color.clone()) },
      uNextColors: { value: initialPalette.map((color) => color.clone()) },
    });
  const material = usePhotonicMaterial(theme, uniformsRef);
  const prototypeMesh = useMemo(
    () => new THREE.Mesh(geometry, material),
    [geometry, material],
  );
  const fitScale = Math.min(0.94, Math.max(0.56, viewport.width / 4.8));

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const policy = getTransitionPolicy(
      motionMode,
      systemPrefersReducedMotion,
    );
    const targetInfluences = influenceTarget(presentation.morph);
    const currentInfluences = [
      ...(mesh.morphTargetInfluences ?? new Array(MORPH_ORDER.length).fill(0)),
    ];
    const currentPalette = blendPalettes(
      uniformsRef.current.uPrevColors.value,
      uniformsRef.current.uNextColors.value,
      uniformsRef.current.uPaletteMix.value,
    );
    const currentIntensity = THREE.MathUtils.lerp(
      uniformsRef.current.uPrevIntensity.value,
      uniformsRef.current.uNextIntensity.value,
      uniformsRef.current.uPaletteMix.value,
    );

    uniformsRef.current.uPrevColors.value = currentPalette;
    uniformsRef.current.uNextColors.value = paletteToColors(presentation.palette);
    uniformsRef.current.uPrevIntensity.value = currentIntensity;
    uniformsRef.current.uNextIntensity.value = presentation.spectralIntensity;

    if (policy.durationMs === 0) {
      mesh.morphTargetInfluences?.forEach((_, index, influences) => {
        influences[index] = targetInfluences[index];
      });
      uniformsRef.current.uPaletteMix.value = 1;
      uniformsRef.current.uReveal.value = 1;
      transitionRef.current = null;
      invalidate();
      return;
    }

    if (!policy.canMorphGeometry) {
      mesh.morphTargetInfluences?.forEach((_, index, influences) => {
        influences[index] = targetInfluences[index];
      });
    }

    uniformsRef.current.uPaletteMix.value = 0;
    uniformsRef.current.uReveal.value = 1;
    transitionRef.current = {
      startTime: performance.now(),
      durationMs: policy.durationMs,
      canMorphGeometry: policy.canMorphGeometry,
      startInfluences: currentInfluences,
      targetInfluences,
    };
    invalidate();
  }, [
    invalidate,
    motionMode,
    presentation,
    systemPrefersReducedMotion,
  ]);

  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);

  useFrame(() => {
    const transition = transitionRef.current;
    const mesh = meshRef.current;
    if (!active || !transition || !mesh) return;

    const progress = clamp01(
      (performance.now() - transition.startTime) / transition.durationMs,
    );
    uniformsRef.current.uPaletteMix.value = smoothstep(0, 0.64, progress);

    if (transition.canMorphGeometry) {
      const morphProgress = smoothstep(0.24, 1, progress);
      mesh.morphTargetInfluences?.forEach((_, index, influences) => {
        influences[index] = THREE.MathUtils.lerp(
          transition.startInfluences[index],
          transition.targetInfluences[index],
          morphProgress,
        );
      });

      uniformsRef.current.uReveal.value =
        progress < 0.18
          ? THREE.MathUtils.lerp(1, 0.12, progress / 0.18)
          : THREE.MathUtils.lerp(
              0.12,
              1,
              smoothstep(0.18, 0.62, progress),
            );
    } else {
      uniformsRef.current.uReveal.value = 1;
    }

    if (progress >= 1) {
      uniformsRef.current.uPaletteMix.value = 1;
      uniformsRef.current.uReveal.value = 1;
      transitionRef.current = null;
      return;
    }

    invalidate();
  });

  return (
    <primitive
      ref={meshRef}
      object={prototypeMesh}
      rotation={[-0.16, -0.34, 0.12]}
      scale={fitScale}
    />
  );
}

function Scene({
  state,
  theme,
  motionMode,
  active,
  systemPrefersReducedMotion,
}: SceneProps & { active: boolean; systemPrefersReducedMotion: boolean }) {
  return (
    <>
      <color attach="background" args={[theme === "dark" ? "#0b0d10" : "#e5e3dc"]} />
      <ambientLight intensity={theme === "dark" ? 0.38 : 0.82} />
      <hemisphereLight
        color={theme === "dark" ? "#f1f4ff" : "#fff9ed"}
        groundColor={theme === "dark" ? "#090a0c" : "#a9aba6"}
        intensity={theme === "dark" ? 1.1 : 1.45}
      />
      <directionalLight
        position={[3.5, 4.5, 5]}
        color={theme === "dark" ? "#f7f8ff" : "#fff9ed"}
        intensity={theme === "dark" ? 4.4 : 3.2}
      />
      <directionalLight
        position={[-4, -1, 2.5]}
        color={theme === "dark" ? "#7a8ca8" : "#c8d2d4"}
        intensity={theme === "dark" ? 2.2 : 1.25}
      />
      <PhotonicPrototype
        state={state}
        theme={theme}
        motionMode={motionMode}
        active={active}
        systemPrefersReducedMotion={systemPrefersReducedMotion}
      />
      <mesh position={[0.2, -1.12, -0.7]} rotation={[-Math.PI / 2, 0, -0.08]}>
        <planeGeometry args={[4.6, 1.8]} />
        <meshBasicMaterial
          color={theme === "dark" ? "#020304" : "#777973"}
          transparent
          opacity={theme === "dark" ? 0.34 : 0.14}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }) ||
        canvas.getContext("webgl", { failIfMajorPerformanceCaveat: true }),
    );
  } catch {
    return false;
  }
}

export function PhotonicSkinScene({ state, theme, motionMode }: SceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [webGLAvailable, setWebGLAvailable] = useState<boolean | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] =
    useState(false);

  useEffect(() => {
    const webGLCheckFrame = window.requestAnimationFrame(() => {
      setWebGLAvailable(supportsWebGL());
    });

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () =>
      setSystemPrefersReducedMotion(media.matches);
    const motionCheckFrame = window.requestAnimationFrame(updateMotionPreference);
    media.addEventListener("change", updateMotionPreference);

    const updateVisibility = () =>
      setDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);

    return () => {
      window.cancelAnimationFrame(webGLCheckFrame);
      window.cancelAnimationFrame(motionCheckFrame);
      media.removeEventListener("change", updateMotionPreference);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "80px", threshold: 0.02 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const active = isVisible && documentVisible;

  return (
    <div
      ref={hostRef}
      data-webgl={webGLAvailable === false ? "fallback" : "pending-or-ready"}
      style={{ position: "absolute", zIndex: 1, inset: 0 }}
    >
      {webGLAvailable ? (
        <Canvas
          aria-hidden="true"
          camera={{ position: [0, 0.08, 6.2], fov: 33, near: 0.1, far: 30 }}
          dpr={[1, 1.5]}
          flat
          frameloop="demand"
          gl={{
            alpha: false,
            antialias: true,
            powerPreference: "high-performance",
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = theme === "dark" ? 1.02 : 0.94;
            gl.domElement.addEventListener(
              "webglcontextlost",
              (event) => {
                event.preventDefault();
                setWebGLAvailable(false);
              },
              { once: true },
            );
          }}
          performance={{ min: 0.5 }}
          resize={{ debounce: { scroll: 120, resize: 80 }, scroll: false }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <Scene
            state={state}
            theme={theme}
            motionMode={motionMode}
            active={active}
            systemPrefersReducedMotion={systemPrefersReducedMotion}
          />
        </Canvas>
      ) : null}
    </div>
  );
}
