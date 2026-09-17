"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FIELD_SIZE } from "./surface-field";
import { surfaceFragment, surfaceVertex } from "./surface-shader";

export interface SurfaceEndpoint { data: Float32Array; palette: string[]; id: string }
export interface SurfaceView {
  source: SurfaceEndpoint;
  target: SurfaceEndpoint;
  progress: number;
  dark: boolean;
  density: number;
  relief: number;
  zoom: number;
  mask: boolean;
  rotating: boolean;
  reset: number;
}

function texture(data: Float32Array) {
  const value = new THREE.Data3DTexture(data, FIELD_SIZE, FIELD_SIZE, FIELD_SIZE);
  value.format = THREE.RedFormat;
  value.type = THREE.FloatType;
  value.minFilter = value.magFilter = THREE.LinearFilter;
  value.unpackAlignment = 1;
  value.needsUpdate = true;
  return value;
}

export function SurfaceCanvas({ view, onError }: { view: SurfaceView; onError: (error: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(view);
  useEffect(() => { latest.current = view; }, [view]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); }
    catch { onError("WebGL 2 недоступен. Для просмотра оболочки включите аппаратное ускорение браузера."); return; }
    if (!renderer.extensions.has("OES_texture_float_linear")) {
      renderer.dispose(); onError("Для этой лаборатории требуется линейная фильтрация 3D float-текстур."); return;
    }
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-label", "Трёхмерный мимик. Перетащите для вращения.");
    canvas.setAttribute("role", "img");
    container.append(canvas);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    let a = latest.current.source, b = latest.current.target;
    let texA = texture(a.data), texB = texture(b.data);
    const colorArray = (colors: string[]) => Array.from({ length: 7 }, (_, i) => new THREE.Color(colors[i % colors.length]));
    const uniforms = {
      uSource: { value: texA }, uTarget: { value: texB }, uProgress: { value: 1 },
      uDark: { value: 0 }, uDensity: { value: 17 }, uRelief: { value: .42 },
      uZoom: { value: 1 }, uAspect: { value: 1 }, uMask: { value: 0 },
      uRotation: { value: new THREE.Matrix3() },
      uPaletteA: { value: colorArray(a.palette) }, uPaletteB: { value: colorArray(b.palette) },
      uCountA: { value: a.palette.length }, uCountB: { value: b.palette.length },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: surfaceVertex, fragmentShader: surfaceFragment, glslVersion: THREE.GLSL3, uniforms, depthTest: false, depthWrite: false });
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      console.error("Surface shader", gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment));
      onError("Не удалось скомпилировать материал оболочки. Подробности — в консоли браузера.");
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    const rotation = new THREE.Matrix4(), eye = new THREE.Vector3(), origin = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
    let yaw = -.98, pitch = .45, dragging = false, px = 0, py = 0, dirty = true;
    let reset = latest.current.reset;
    const down = (event: PointerEvent) => { dragging = true; px = event.clientX; py = event.clientY; canvas.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => {
      if (!dragging) return;
      yaw -= (event.clientX - px) * .007;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (event.clientY - py) * .007));
      px = event.clientX; py = event.clientY;
      dirty = true;
    };
    const stop = () => { dragging = false; };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop);
    const lost = (event: Event) => { event.preventDefault(); onError("Контекст WebGL потерян. Обновите страницу, чтобы восстановить сцену."); };
    canvas.addEventListener("webglcontextlost", lost);
    const resize = new ResizeObserver(() => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      uniforms.uAspect.value = container.clientWidth / Math.max(1, container.clientHeight);
      dirty = true;
    });
    resize.observe(container);
    let raf = 0, previous = 0, drawnView: SurfaceView | null = null;
    const draw = (now: number) => {
      const v = latest.current;
      if (a !== v.source) { texA.dispose(); a = v.source; texA = texture(a.data); uniforms.uSource.value = texA; uniforms.uPaletteA.value = colorArray(a.palette); uniforms.uCountA.value = a.palette.length; }
      if (b !== v.target) { texB.dispose(); b = v.target; texB = texture(b.data); uniforms.uTarget.value = texB; uniforms.uPaletteB.value = colorArray(b.palette); uniforms.uCountB.value = b.palette.length; }
      if (reset !== v.reset) { reset = v.reset; yaw = -.98; pitch = .45; }
      if (v.rotating && !dragging) yaw += Math.min((now - previous) / 1000, .04) * .18;
      previous = now;
      eye.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch));
      rotation.lookAt(eye, origin, up);
      uniforms.uRotation.value.setFromMatrix4(rotation);
      uniforms.uProgress.value = v.progress;
      uniforms.uDark.value = v.dark ? 1 : 0;
      uniforms.uDensity.value = v.density;
      uniforms.uRelief.value = v.relief;
      uniforms.uZoom.value = v.zoom;
      uniforms.uMask.value = v.mask ? 1 : 0;
      if (document.visibilityState !== "hidden" && (dirty || drawnView !== v || v.rotating)) {
        renderer.render(scene, camera); dirty = false; drawnView = v;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf); resize.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", stop); canvas.removeEventListener("pointercancel", stop);
      canvas.removeEventListener("webglcontextlost", lost);
      texA.dispose(); texB.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [onError]);
  return <div ref={host} style={{ position: "absolute", inset: "205px 0 50px", touchAction: "none", cursor: "grab" }} />;
}
