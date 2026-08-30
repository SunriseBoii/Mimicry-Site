/**
 * Query-gated GPU-bank diagnostics: sampler snapshot, isolation commands,
 * framebuffer silhouette, and live-bank parity. Isolation commands never
 * switch DPR, resize, or lose context.
 */

import type { WebGLRenderer } from "three";
import type { DataTexture, RawShaderMaterial } from "three";
import { cssFromDeviceBBox, visibleFractionFor, type ActorMaskBBox } from "./composition";
import type { GpuTextureBank, GpuTexturePool } from "./gpu-texture-pool";
import { TEXTURE_SLOT_NAMES, TEXTURE_SLOT_SPECS, type TextureSlotName } from "./texture-pack";

export const SAMPLER_UNIFORM_BY_SLOT: Record<TextureSlotName, string> = Object.fromEntries(
  TEXTURE_SLOT_SPECS.map((spec) => [spec.name, spec.sampler]),
) as Record<TextureSlotName, string>;

export const FRAMEBUFFER_VISIBILITY = {
  desktop: { minBboxWidth: 48, minBboxHeight: 48, minVisiblePixels: 256, minVisibleFraction: 0.9 },
  mobile390: { minBboxWidth: 24, minBboxHeight: 24, minVisiblePixels: 64, minVisibleFraction: 0.85 },
} as const;

export type IsolationCommand = "invalidate" | "rebind" | "reupload" | "republish";

export interface MaterialSamplerSnapshot {
  materialUuid: string;
  programCount: number;
  activeBankId: number | null;
  generation: number | null;
  uniforms: Array<{
    uniformName: string;
    logicalSlot: TextureSlotName;
    boundTextureUuid: string | null;
    bankTextureUuid: string | null;
    match: boolean;
  }>;
  allSamplerUuidsMatchActiveBank: boolean;
}

export interface FramebufferSilhouette {
  visiblePixelCount: number;
  bbox: ActorMaskBBox | null;
  bboxWidth: number;
  bboxHeight: number;
  bboxArea: number;
  actorVisibleFraction: number;
  centroid: { x: number; y: number } | null;
  edgeClipping: boolean;
  drawingBuffer: readonly [number, number];
  dpr: number;
  actorDraw: boolean;
  failDrawWithoutPixels: boolean;
  pass: boolean;
}

export function samplerUniformsFromMaterial(
  material: RawShaderMaterial,
): Record<string, DataTexture | null> {
  const uniforms = material.uniforms as Record<string, { value?: DataTexture | null }>;
  const out: Record<string, DataTexture | null> = {};
  for (const spec of TEXTURE_SLOT_SPECS) {
    out[spec.sampler] = uniforms[spec.sampler]?.value ?? null;
  }
  return out;
}

export function getMaterialSamplerSnapshot(args: {
  material: RawShaderMaterial;
  pool: GpuTexturePool | null | undefined;
  programCount: number;
}): MaterialSamplerSnapshot {
  const bank = args.pool?.active() ?? null;
  const uniforms = samplerUniformsFromMaterial(args.material);
  const rows = TEXTURE_SLOT_NAMES.map((name) => {
    const uniformName = SAMPLER_UNIFORM_BY_SLOT[name];
    const bound = uniforms[uniformName];
    const bankTexture = bank?.textures[name] ?? null;
    return {
      uniformName,
      logicalSlot: name,
      boundTextureUuid: bound?.uuid ?? null,
      bankTextureUuid: bankTexture?.uuid ?? null,
      match: Boolean(bound && bankTexture && bound.uuid === bankTexture.uuid),
    };
  });
  return {
    materialUuid: args.material.uuid,
    programCount: args.programCount,
    activeBankId: bank?.id ?? null,
    generation: bank?.generation ?? null,
    uniforms: rows,
    allSamplerUuidsMatchActiveBank: rows.every((row) => row.match),
  };
}

export function applyBankSamplers(
  uniforms: object,
  bank: GpuTextureBank,
) {
  const table = uniforms as Record<string, { value?: unknown }>;
  for (const spec of TEXTURE_SLOT_SPECS) {
    table[spec.sampler]!.value = bank.textures[spec.name];
  }
}

export function measureFramebufferSilhouette(args: {
  gl: WebGLRenderer;
  actorMask: boolean;
  actorDraw: boolean;
  profile?: "desktop" | "mobile390";
  pixels?: Uint8Array;
  drawingWidth?: number;
  drawingHeight?: number;
}): FramebufferSilhouette {
  const context = args.gl.getContext();
  const dpr = args.gl.getPixelRatio() || 1;
  const canvas = args.gl.domElement;
  const drawingW = args.drawingWidth ?? canvas.width;
  const drawingH = args.drawingHeight ?? canvas.height;
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  const threshold = FRAMEBUFFER_VISIBILITY[args.profile ?? (cssW <= 430 ? "mobile390" : "desktop")];
  if (drawingW < 2 || drawingH < 2) {
    return {
      visiblePixelCount: 0,
      bbox: null,
      bboxWidth: 0,
      bboxHeight: 0,
      bboxArea: 0,
      actorVisibleFraction: 0,
      centroid: null,
      edgeClipping: false,
      drawingBuffer: [drawingW, drawingH],
      dpr,
      actorDraw: args.actorDraw,
      failDrawWithoutPixels: args.actorDraw,
      pass: !args.actorDraw,
    };
  }
  const pixels = args.pixels ?? new Uint8Array(drawingW * drawingH * 4);
  if (!args.pixels) context.readPixels(0, 0, drawingW, drawingH, context.RGBA, context.UNSIGNED_BYTE, pixels);
  let minX = drawingW;
  let minY = drawingH;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < drawingH; y += 1) {
    for (let x = 0; x < drawingW; x += 1) {
      const offset = (y * drawingW + x) * 4;
      const r = pixels[offset]!;
      const g = pixels[offset + 1]!;
      const b = pixels[offset + 2]!;
      const a = pixels[offset + 3]!;
      const hit = args.actorMask
        ? r > 180 && g > 180 && b > 180 && a > 8
        : a > 12;
      if (!hit) continue;
      count += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const bbox = cssFromDeviceBBox({ minX, minY, maxX, maxY, count }, drawingH, dpr);
  const bboxWidth = bbox?.width ?? 0;
  const bboxHeight = bbox?.height ?? 0;
  const actorVisibleFraction = visibleFractionFor(bbox, cssW, cssH);
  const failDrawWithoutPixels = args.actorDraw && count === 0;
  const pass = args.actorDraw
    ? count >= threshold.minVisiblePixels
      && bboxWidth >= threshold.minBboxWidth
      && bboxHeight >= threshold.minBboxHeight
      && actorVisibleFraction >= threshold.minVisibleFraction
    : count === 0;
  return {
    visiblePixelCount: count,
    bbox,
    bboxWidth,
    bboxHeight,
    bboxArea: bboxWidth * bboxHeight,
    actorVisibleFraction,
    centroid: count > 0 ? { x: sumX / count / dpr, y: (drawingH - sumY / count) / dpr } : null,
    edgeClipping: Boolean(bbox && (
      bbox.left <= 1.5 || bbox.top <= 1.5 || bbox.right >= cssW - 1.5 || bbox.bottom >= cssH - 1.5
    )),
    drawingBuffer: [drawingW, drawingH],
    dpr,
    actorDraw: args.actorDraw,
    failDrawWithoutPixels,
    pass: pass && !failDrawWithoutPixels,
  };
}

export function emptyFramebufferSilhouette(args: {
  gl: WebGLRenderer;
  actorDraw?: boolean;
}): FramebufferSilhouette {
  const canvas = args.gl.domElement;
  return {
    visiblePixelCount: 0,
    bbox: null,
    bboxWidth: 0,
    bboxHeight: 0,
    bboxArea: 0,
    actorVisibleFraction: 0,
    centroid: null,
    edgeClipping: false,
    drawingBuffer: [canvas.width, canvas.height],
    dpr: args.gl.getPixelRatio() || 1,
    actorDraw: args.actorDraw === true,
    failDrawWithoutPixels: false,
    pass: args.actorDraw !== true,
  };
}

export function sampleLiveBankEndpoints(bank: GpuTextureBank, ids: readonly number[]) {
  return ids.map((id) => {
    const out = id * 4;
    return {
      id,
      source: [
        bank.buffers.source[out] ?? 0,
        bank.buffers.source[out + 1] ?? 0,
        bank.buffers.source[out + 2] ?? 0,
      ] as const,
      target: [
        bank.buffers.target[out] ?? 0,
        bank.buffers.target[out + 1] ?? 0,
        bank.buffers.target[out + 2] ?? 0,
      ] as const,
      sourceScale: bank.buffers.source[out + 3] ?? 0,
      targetScale: bank.buffers.target[out + 3] ?? 0,
      activation: [
        bank.buffers.activation[out] ?? 0,
        bank.buffers.activation[out + 1] ?? 0,
        bank.buffers.activation[out + 2] ?? 0,
        bank.buffers.activation[out + 3] ?? 0,
      ] as const,
    };
  });
}

export function liveBankMatchesCpu(args: {
  bank: GpuTextureBank;
  ids: readonly number[];
  epsilon?: number;
}) {
  const epsilon = args.epsilon ?? 1e-4;
  const samples = sampleLiveBankEndpoints(args.bank, args.ids);
  const source = args.bank.source;
  const target = args.bank.target;
  if (!source || !target) {
    return { pass: false, reason: "missing-cpu-endpoint", samples, activationNonZero: false };
  }
  let pass = true;
  let activationNonZero = false;
  for (const sample of samples) {
    const p = sample.id * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(sample.source[axis] - source.position[p + axis]!) > epsilon) pass = false;
      if (Math.abs(sample.target[axis] - target.position[p + axis]!) > epsilon) pass = false;
      if (!Number.isFinite(sample.source[axis]) || !Number.isFinite(sample.target[axis])) pass = false;
    }
    if (sample.activation.some((value) => Math.abs(value) > 1e-8)) activationNonZero = true;
  }
  const activationTexture = args.bank.buffers.activation;
  let activationHits = 0;
  for (let index = 0; index < Math.min(activationTexture.length, 16384 * 4); index += 4) {
    if (Math.abs(activationTexture[index]!) > 1e-8 || Math.abs(activationTexture[index + 1]!) > 1e-8) {
      activationHits += 1;
    }
  }
  if (activationHits === 0) {
    pass = false;
    activationNonZero = false;
  } else activationNonZero = true;
  return { pass, samples, activationNonZero, activationHits };
}

export function isolationCommandName(command: IsolationCommand) {
  if (command === "invalidate") return "forceInvalidateOnly";
  if (command === "rebind") return "forceRebindActiveBankOnly";
  if (command === "reupload") return "forceReuploadActiveBankOnly";
  return "forceFullBankRepublish";
}
