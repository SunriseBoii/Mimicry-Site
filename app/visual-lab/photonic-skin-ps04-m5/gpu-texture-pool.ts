/**
 * Fixed three-bank GPU-resident texture pool. Texture objects are created once;
 * pair changes write into existing Float32Array backings and upload via
 * renderer.initTexture. No new material or WebGL program.
 */

import type { WebGLRenderer } from "three";
import type { DecodedState, LabFrame } from "../photonic-skin-m4-1/m41-data";
import type { TransitionProgram } from "../photonic-skin-m4-1/m41-evaluator";
import { resolvePresentationFrame, type PresentationFrame } from "../photonic-skin-m4-1r/photonic-presentation";
import type { R6Instrumentation } from "./r6-instrumentation";
import {
  PAIR_TEXTURE_COUNT,
  STATE_TEXTURE_SIZE,
  TEXTURE_SLOT_NAMES,
  TEXTURE_SLOT_SPECS,
  TRACK_TEXTURE_HEIGHT,
  TRACK_TEXTURE_WIDTH,
  dataTexture,
  floatBufferStats,
  markTextureDataChanged,
  packProgramInto,
  packStateInto,
  slotKind,
  stateTexelCount,
  trackTexelCount,
  type PairTextureSet,
  type TextureSlotName,
} from "./texture-pack";

export const GPU_BANK_COUNT = 3;
export const GPU_TEXTURE_BUDGET = GPU_BANK_COUNT * PAIR_TEXTURE_COUNT;

export type BankRole = "active" | "forward" | "pending";

export interface UploadAckToken {
  bankId: number;
  generation: number;
  textureIndex: number;
  expectedTextureVersion: number;
  navigationRevision: number | null;
}

export interface BankSnapshot {
  id: number;
  role: BankRole;
  key: string | null;
  revision: number | null;
  generation: number;
  cpuPacked: boolean;
  gpuReady: boolean;
  packedSlots: number;
  uploadedSlots: number;
  acknowledgedSlots: number;
  textureUuids: string[];
}

export function pairBankKey(sourceId: string, targetId: string, programId: string) {
  return `${sourceId}|${targetId}|${programId}`;
}

function emptyFloat(count: number) {
  return new Float32Array(count);
}

export class GpuTextureBank {
  readonly id: number;
  readonly textures: PairTextureSet;
  readonly buffers: Record<TextureSlotName, Float32Array> & { m3Route: Float32Array };
  key: string | null = null;
  revision: number | null = null;
  generation = 0;
  cpuPacked = false;
  gpuReady = false;
  packedSlots = new Array<boolean>(PAIR_TEXTURE_COUNT).fill(false);
  uploaded = new Array<boolean>(PAIR_TEXTURE_COUNT).fill(false);
  requestedRevision = new Array<number>(PAIR_TEXTURE_COUNT).fill(0);
  acknowledgedRevision = new Array<number>(PAIR_TEXTURE_COUNT).fill(0);
  lastAckToken: UploadAckToken | null = null;
  sourceFrame: PresentationFrame | null = null;
  targetFrame: PresentationFrame | null = null;
  source: DecodedState | null = null;
  target: DecodedState | null = null;
  program: TransitionProgram | null = null;
  gpuWarmed = false;
  pinned = false;

  constructor(id: number) {
    this.id = id;
    const state = stateTexelCount();
    const track = trackTexelCount();
    this.buffers = {
      source: emptyFloat(state),
      target: emptyFloat(state),
      sourceNormal: emptyFloat(state),
      targetNormal: emptyFloat(state),
      sourceQuat: emptyFloat(state),
      targetQuat: emptyFloat(state),
      sourceMeta: emptyFloat(state),
      targetMeta: emptyFloat(state),
      residual: emptyFloat(state),
      lanes: emptyFloat(state),
      velocity: emptyFloat(state),
      activation: emptyFloat(state),
      sourceTracks: emptyFloat(track),
      targetTracks: emptyFloat(track),
      routes: emptyFloat(track),
      windows: emptyFloat(track),
      m3Route: emptyFloat(state),
    };
    this.textures = {
      source: dataTexture(this.buffers.source, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      target: dataTexture(this.buffers.target, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      sourceNormal: dataTexture(this.buffers.sourceNormal, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      targetNormal: dataTexture(this.buffers.targetNormal, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      sourceQuat: dataTexture(this.buffers.sourceQuat, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      targetQuat: dataTexture(this.buffers.targetQuat, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      sourceMeta: dataTexture(this.buffers.sourceMeta, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      targetMeta: dataTexture(this.buffers.targetMeta, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      residual: dataTexture(this.buffers.residual, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      lanes: dataTexture(this.buffers.lanes, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      velocity: dataTexture(this.buffers.velocity, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      activation: dataTexture(this.buffers.activation, STATE_TEXTURE_SIZE, STATE_TEXTURE_SIZE),
      sourceTracks: dataTexture(this.buffers.sourceTracks, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
      targetTracks: dataTexture(this.buffers.targetTracks, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
      routes: dataTexture(this.buffers.routes, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
      windows: dataTexture(this.buffers.windows, TRACK_TEXTURE_WIDTH, TRACK_TEXTURE_HEIGHT),
    };
  }

  beginJob(args: { key: string; revision: number; source: DecodedState; target: DecodedState }) {
    this.generation += 1;
    this.key = args.key;
    this.revision = args.revision;
    this.cpuPacked = false;
    this.gpuReady = false;
    this.packedSlots.fill(false);
    this.uploaded.fill(false);
    this.requestedRevision.fill(0);
    this.acknowledgedRevision.fill(0);
    this.lastAckToken = null;
    this.sourceFrame = resolvePresentationFrame(args.source.entry);
    this.targetFrame = resolvePresentationFrame(args.target.entry);
    this.source = args.source;
    this.target = args.target;
    this.program = null;
    this.gpuWarmed = false;
  }

  nextPackIndex() {
    return this.packedSlots.findIndex((value) => !value);
  }

  nextUploadIndex() {
    return this.uploaded.findIndex((value) => !value);
  }

  packNextSlot(args: { source: DecodedState; target: DecodedState; program: TransitionProgram; profile?: LabFrame }) {
    const index = this.nextPackIndex();
    if (index < 0) {
      this.cpuPacked = true;
      return -1;
    }
    const name = TEXTURE_SLOT_NAMES[index]!;
    const kind = slotKind(name);
    if (kind !== "program") {
      const endpoint = name.includes("target") ? args.target : args.source;
      packStateInto(this.buffers[name], endpoint, kind, args.profile);
    } else if (index === 8) {
      packProgramInto(this.buffers, args.program, args.source, args.target);
      this.program = args.program;
    }
    this.textures[name].image.data = this.buffers[name];
    markTextureDataChanged(this.textures[name]);
    this.packedSlots[index] = true;
    if (this.packedSlots.every(Boolean)) this.cpuPacked = true;
    return index;
  }

  packAll(args: { source: DecodedState; target: DecodedState; program: TransitionProgram; profile?: LabFrame }) {
    while (this.nextPackIndex() >= 0) this.packNextSlot(args);
    return this.cpuPacked;
  }

  allAcknowledged() {
    return this.acknowledgedRevision.every((revision, index) => (
      revision > 0 && revision === this.requestedRevision[index] && this.uploaded[index]
    ));
  }

  refreshGpuReady() {
    this.gpuReady = this.cpuPacked && this.allAcknowledged() && this.packedSlots.every(Boolean);
    if (this.gpuReady) this.gpuWarmed = true;
    return this.gpuReady;
  }

  uploadNextSlot(renderer: WebGLRenderer, instrumentation?: R6Instrumentation) {
    if (!this.cpuPacked && this.nextPackIndex() >= 0) {
      return { index: this.nextPackIndex(), durationMs: 0, waitingForCpu: true as const };
    }
    const index = this.nextUploadIndex();
    if (index < 0) {
      this.refreshGpuReady();
      return { index: -1, durationMs: 0, gpuReady: this.gpuReady };
    }
    if (!this.packedSlots[index]) {
      return { index, durationMs: 0, waitingForCpu: true as const };
    }
    const name = TEXTURE_SLOT_NAMES[index]!;
    const texture = this.textures[name];
    const spec = TEXTURE_SLOT_SPECS[index]!;
    const generation = this.generation;
    texture.image.data = this.buffers[name];
    markTextureDataChanged(texture);
    const expectedTextureVersion = texture.version;
    this.requestedRevision[index] = expectedTextureVersion;
    const token: UploadAckToken = {
      bankId: this.id,
      generation,
      textureIndex: index,
      expectedTextureVersion,
      navigationRevision: this.revision,
    };
    const previous = texture.onUpdate;
    texture.onUpdate = (updated) => {
      if (this.generation !== token.generation || updated.version !== token.expectedTextureVersion) {
        previous?.(updated);
        return;
      }
      this.acknowledgedRevision[index] = token.expectedTextureVersion;
      this.uploaded[index] = true;
      this.lastAckToken = token;
      instrumentation?.noteTextureUpload(spec.byteSize);
      previous?.(updated);
    };
    texture.source.dataReady = true;
    const started = typeof performance !== "undefined" ? performance.now() : 0;
    renderer.initTexture(texture);
    const durationMs = (typeof performance !== "undefined" ? performance.now() : 0) - started;
    instrumentation?.noteInitTexture(name, durationMs);
    this.refreshGpuReady();
    return {
      index,
      durationMs,
      slot: name,
      acknowledged: this.uploaded[index] === true,
      expectedTextureVersion,
      generation,
    };
  }

  reuploadPacked(renderer: WebGLRenderer, instrumentation?: R6Instrumentation) {
    this.gpuReady = false;
    this.gpuWarmed = false;
    this.uploaded.fill(false);
    this.requestedRevision.fill(0);
    this.acknowledgedRevision.fill(0);
    for (const name of TEXTURE_SLOT_NAMES) markTextureDataChanged(this.textures[name]);
    const results = [];
    while (this.nextUploadIndex() >= 0) {
      if (!this.packedSlots[this.nextUploadIndex()!]) break;
      const before = this.nextUploadIndex();
      const result = this.uploadNextSlot(renderer, instrumentation);
      results.push(result);
      if (this.nextUploadIndex() === before) break;
    }
    return results;
  }

  markGpuDirty() {
    this.gpuReady = false;
    this.gpuWarmed = false;
    this.uploaded.fill(false);
    this.requestedRevision.fill(0);
    this.acknowledgedRevision.fill(0);
    for (const name of TEXTURE_SLOT_NAMES) markTextureDataChanged(this.textures[name]);
  }

  clearJob() {
    this.generation += 1;
    this.key = null;
    this.revision = null;
    this.cpuPacked = false;
    this.gpuReady = false;
    this.packedSlots.fill(false);
    this.uploaded.fill(false);
    this.requestedRevision.fill(0);
    this.acknowledgedRevision.fill(0);
    this.pinned = false;
  }

  slotInventory() {
    return TEXTURE_SLOT_NAMES.map((name, index) => {
      const texture = this.textures[name];
      const spec = TEXTURE_SLOT_SPECS[index]!;
      const stats = floatBufferStats(this.buffers[name]);
      return {
        logicalSlot: name,
        uniformName: spec.sampler,
        textureUuid: texture.uuid,
        sourceUuid: texture.source.uuid,
        width: texture.image.width as number,
        height: texture.image.height as number,
        format: "RGBA" as const,
        type: "Float" as const,
        textureVersion: texture.version,
        generation: this.generation,
        cpuByteLength: stats.byteLength,
        cpuChecksum: stats.checksum,
        min: stats.min,
        max: stats.max,
        nanCount: stats.nanCount,
        infCount: stats.infCount,
        uploadRequestedRevision: this.requestedRevision[index] ?? 0,
        uploadAcknowledgementRevision: this.acknowledgedRevision[index] ?? 0,
        packed: this.packedSlots[index] === true,
        acknowledged: this.uploaded[index] === true,
      };
    });
  }

  snapshot(role: BankRole): BankSnapshot {
    return {
      id: this.id,
      role,
      key: this.key,
      revision: this.revision,
      generation: this.generation,
      cpuPacked: this.cpuPacked,
      gpuReady: this.gpuReady,
      packedSlots: this.packedSlots.filter(Boolean).length,
      uploadedSlots: this.uploaded.filter(Boolean).length,
      acknowledgedSlots: this.acknowledgedRevision.filter((value, index) => value > 0 && value === this.requestedRevision[index]).length,
      textureUuids: TEXTURE_SLOT_NAMES.map((name) => this.textures[name].uuid),
    };
  }

  dispose() {
    for (const name of TEXTURE_SLOT_NAMES) this.textures[name].dispose();
  }
}

export class GpuTexturePool {
  readonly list: GpuTextureBank[];
  private activeIndex = 0;
  private forwardIndex = 1;
  private pendingIndex = 2;
  created = GPU_TEXTURE_BUDGET;
  disposed = 0;
  contextGeneration = 0;

  constructor() {
    this.list = [new GpuTextureBank(0), new GpuTextureBank(1), new GpuTextureBank(2)];
  }

  textureCount() {
    return this.created - this.disposed;
  }

  overBudget() {
    return this.textureCount() > GPU_TEXTURE_BUDGET;
  }

  active() {
    return this.list[this.activeIndex]!;
  }

  forward() {
    return this.list[this.forwardIndex]!;
  }

  pending() {
    return this.list[this.pendingIndex]!;
  }

  roleOf(bank: GpuTextureBank): BankRole {
    if (bank === this.active()) return "active";
    if (bank === this.forward()) return "forward";
    return "pending";
  }

  findById(id: number) {
    return this.list.find((bank) => bank.id === id) ?? null;
  }

  findByKey(key: string) {
    return this.list.find((bank) => bank.key === key) ?? null;
  }

  findByRevision(revision: number) {
    return this.list.find((bank) => bank.revision === revision) ?? null;
  }

  stagingBank(prefer: "forward" | "pending" = "forward") {
    return prefer === "pending" ? this.pending() : this.forward();
  }

  /** Prefer an unused staging bank; never the live active bank. */
  acquireStaging(pinnedRevisions: ReadonlySet<number>, prefer: "forward" | "pending" = "forward") {
    const first = this.stagingBank(prefer);
    const second = prefer === "forward" ? this.pending() : this.forward();
    if (first.revision == null || !pinnedRevisions.has(first.revision) || first.gpuReady === false) return first;
    if (second.revision == null || !pinnedRevisions.has(second.revision)) return second;
    return first;
  }

  promoteToActive(bank: GpuTextureBank) {
    if (bank === this.active()) return;
    if (!bank.gpuReady) return;
    const previousActive = this.activeIndex;
    if (bank === this.forward()) {
      this.activeIndex = this.forwardIndex;
      this.forwardIndex = previousActive;
      return;
    }
    this.activeIndex = this.pendingIndex;
    this.pendingIndex = previousActive;
  }

  markContextLost() {
    this.contextGeneration += 1;
    for (const bank of this.list) bank.markGpuDirty();
  }

  recreateAfterRestore() {
    for (const bank of this.list) {
      bank.dispose();
      this.disposed += PAIR_TEXTURE_COUNT;
    }
    this.list[0] = new GpuTextureBank(0);
    this.list[1] = new GpuTextureBank(1);
    this.list[2] = new GpuTextureBank(2);
    this.activeIndex = 0;
    this.forwardIndex = 1;
    this.pendingIndex = 2;
    this.created += GPU_TEXTURE_BUDGET;
    this.contextGeneration += 1;
  }

  snapshot() {
    return {
      textureCount: this.textureCount(),
      budget: GPU_TEXTURE_BUDGET,
      created: this.created,
      disposed: this.disposed,
      contextGeneration: this.contextGeneration,
      banks: [
        this.active().snapshot("active"),
        this.forward().snapshot("forward"),
        this.pending().snapshot("pending"),
      ],
    };
  }

  dispose() {
    for (const bank of this.list) {
      bank.dispose();
      this.disposed += PAIR_TEXTURE_COUNT;
    }
  }
}
