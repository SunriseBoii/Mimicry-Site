import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyR2Patch, type R2Manifest } from "../app/visual-lab/photonic-skin-ps04-m6/final-r2/release-geometry";
import { applyEventPatch } from "../app/visual-lab/photonic-skin-ps04-m6/final-r2/event-geometry";
import { applyReleasePatch, type ReleaseGeometryManifest } from "../app/visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";
import { decodeState, type StateEntry } from "../app/visual-lab/photonic-skin-m4-1/m41-data";
import { PhotonicMotionSession } from "../app/visual-lab/photonic-skin-ps04-m3/session";
import { compileTransition, evaluateElement } from "../app/visual-lab/photonic-skin-m4-1/m41-evaluator";
import { MagnetizedSettleController } from "../app/visual-lab/photonic-skin-ps04-m6/magnetized-settle/magnetized-settle-runtime";

const base = "public/photonic-skin/";
const read = (path: string) => readFileSync(base + path);
const json = (path: string) => JSON.parse(read(path).toString());
const hash = (data: Uint8Array | ArrayBuffer) => createHash("sha256").update(new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer, data instanceof ArrayBuffer ? 0 : data.byteOffset, data.byteLength)).digest("hex");
const buffer = (data: Uint8Array): ArrayBuffer => Uint8Array.from(data).buffer;
const r1 = json("ps-04-final-r1/manifest.json") as ReleaseGeometryManifest;
const r2 = json("ps-04-final-r2/manifest.json") as R2Manifest;
const entries = [
  ...json("ps-04-m5-5/manifests/ps04m55-manifest.json").states.map((entry: StateEntry) => ({entry,ns:"ps-04-m5-5"})),
  ...json("ps-04-m6-1/manifests/ps04m61-delta-manifest.json").states.map((entry: StateEntry) => ({entry,ns:"ps-04-m6-1"})),
] as {entry: StateEntry & { componentMap: { competencyId: string }[] }; ns: string}[];

test("Event R4 covers all 203 derivatives after Video and changes only the viewer-right geometry", () => {
  const event = json("ps-04-event-r4/manifest.json");
  let count = 0;
  for (const {entry,ns} of entries) {
    const patch = event.states[entry.stateId];
    assert.equal(Boolean(patch),entry.componentMap.some(c=>c.competencyId === "event"),entry.stateId);
    if (!patch) continue;
    count++;
    let source = buffer(read(`${ns}/${entry.bufferPath}`));
    const parent = r1.states[entry.stateId];
    source = applyReleasePatch(source,buffer(read(`ps-04-final-r1/${parent.patchPath}`)),parent);
    const video = r2.states[entry.stateId];
    if (video) source = applyR2Patch(source,buffer(read(`ps-04-final-r2/${video.patchPath}`)),video);
    assert.equal(hash(source),patch.sourceHash,entry.stateId);
    const bytes = buffer(read(`ps-04-event-r4/${patch.patchPath}`));
    assert.equal(hash(bytes),patch.patchHash);
    const result = new Uint8Array(applyEventPatch(source,bytes,patch));
    assert.equal(hash(result),patch.resultHash);
    const original = new Uint8Array(source);
    for (let id=0;id<16384;id++) {
      const offset=id*40,target=original[offset+30]===patch.componentIndex;
      assert.deepEqual(result.subarray(offset+(target?26:0),offset+40),original.subarray(offset+(target?26:0),offset+40));
    }
  }
  assert.equal(count,203);
});

test("Event R4 rejects reordered identities and truncated payloads", () => {
  const patch=json("ps-04-event-r4/manifest.json").states["single-event"];
  const source=buffer(read("ps-04-final-r1/event-a-r3.state.bin"));
  const data=buffer(read(`ps-04-event-r4/${patch.patchPath}`));
  assert.throws(()=>applyEventPatch(source,data.slice(2),patch),/length/);
  new DataView(data).setUint16(28,new DataView(data).getUint16(0,true),true);
  assert.throws(()=>applyEventPatch(source,data,patch),/identity/);
});

test("Builder Video R3 balances all 126 GATHER/DRIVE sets and preserves accepted Event and other peers", () => {
  const video = json("ps-04-builder-video-r3/manifest.json");
  const event = json("ps-04-event-r4/manifest.json");
  let count=0;
  for(const {entry,ns} of entries) {
    const patch=video.states[entry.stateId];
    assert.equal(Boolean(patch),/^complex-(gather|drive)-/.test(entry.stateId)&&entry.componentMap.some(c=>c.competencyId==='video'),entry.stateId);
    if(!patch)continue;
    count++;
    let source=buffer(read(`${ns}/${entry.bufferPath}`));
    const parent=r1.states[entry.stateId];
    if(parent)source=applyReleasePatch(source,buffer(read(`ps-04-final-r1/${parent.patchPath}`)),parent);
    const r2patch=r2.states[entry.stateId];
    source=applyR2Patch(source,buffer(read(`ps-04-final-r2/${r2patch.patchPath}`)),r2patch);
    const ep=event.states[entry.stateId];
    if(ep)source=applyEventPatch(source,buffer(read(`ps-04-event-r4/${ep.patchPath}`)),ep);
    assert.equal(hash(source),patch.sourceHash);
    const bytes=buffer(read(`ps-04-builder-video-r3/${patch.patchPath}`));
    assert.equal(hash(bytes),patch.patchHash);
    const result=new Uint8Array(applyR2Patch(source,bytes,patch)),original=new Uint8Array(source);
    assert.equal(hash(result),patch.resultHash);
    for(let id=0;id<16384;id++) {
      const offset=id*40,target=patch.componentIndices.includes(original[offset+30]);
      for(let field=0;field<40;field++) {
        if(target&&(field<12||field===26||field===27))continue;
        if(result[offset+field]!==original[offset+field])assert.fail(`${entry.stateId} ID ${id} byte ${field}`);
      }
    }
    assert.ok(patch.presentationFrame.scale>0);
    assert.ok(patch.presentationFrame.translate.every(Number.isFinite));
  }
  assert.equal(count,126);
  assert.equal(video.states['single-video'],undefined);
});

test("R2 verifies every layered hash and preserves all non-Video bytes and persistent metadata", () => {
  let count = 0;
  for (const {entry, ns} of entries) {
    const patch = r2.states[entry.stateId];
    const owners = new Set(entry.componentMap?.map(c => c.competencyId));
    assert.equal(Boolean(patch), owners.has("video") && owners.size > 1, entry.stateId);
    if (!patch) continue;
    count++;
    let source = buffer(read(`${ns}/${entry.bufferPath}`));
    assert.equal(hash(source), entry.contentHash);
    const parent = r1.states[entry.stateId];
    if (parent) source = applyReleasePatch(source, buffer(read(`ps-04-final-r1/${parent.patchPath}`)), parent);
    assert.equal(hash(source), patch.sourceHash);
    const bytes = read(`ps-04-final-r2/${patch.patchPath}`);
    assert.equal(hash(bytes), patch.patchHash);
    const result = new Uint8Array(applyR2Patch(source, buffer(bytes), patch));
    assert.equal(hash(result), patch.resultHash);
    const original = new Uint8Array(source);
    for (let id=0;id<16384;id++) {
      const offset=id*40, changed=patch.componentIndices.includes(original[offset+30]);
      for (let field=0;field<40;field++) {
        if (changed && (field<12 || field===26 || field===27)) continue;
        if (result[offset+field]!==original[offset+field]) assert.fail(`${entry.stateId} ID ${id} byte ${field}`);
      }
    }
  }
  assert.equal(count,Object.keys(r2.states).length);
  assert.equal(entries.filter(({entry})=>entry.stateId.startsWith("complex-") && /^(complex-gather|complex-drive)-/.test(entry.stateId) && r2.states[entry.stateId]).length,126);
  assert.equal(r2.states["single-video"],undefined);
  assert.equal(r2.states["single-event"],undefined);
});

test("R2 patch rejects duplicate IDs and non-Video component edits", () => {
  const patch = r2.states["complex-gather-event-video"];
  const bytes = buffer(read(`ps-04-final-r2/${patch.patchPath}`));
  new DataView(bytes).setUint16(16, new DataView(bytes).getUint16(0,true),true);
  assert.throws(()=>applyR2Patch(new ArrayBuffer(16384*40),bytes,patch),/identity\/component/);
});

test("rapid builder edits do not publish a stale cancellation of the replacement", () => {
  let key="empty";
  const controller=new MagnetizedSettleController({earlyTransitions:true,latestPreparedWins:true,resolveContract:nodeId=>({nodeId,key})});
  controller.adoptBoot("03.2",key);
  key="video";
  assert.ok(controller.requestInScreenAction("03.2",10));
  controller.consumeBegin();
  key="event-video";
  assert.ok(controller.requestInScreenAction("03.2",20));
  assert.equal(controller.consumeCancel(),false);
  assert.equal(controller.consumeBegin()?.semanticContractKey,"event-video");
});

test("magnetic return to the same anchored screen replaces an early neighbouring morph", () => {
  const controller=new MagnetizedSettleController({earlyTransitions:true,latestPreparedWins:true,resolveContract:nodeId=>({nodeId,key:nodeId})});
  controller.adoptBoot("05.7","05.7");
  controller.requestDestination("05.6",10);
  controller.consumeBegin();
  controller.noteActorFrame({status:"settled",visualLifecycle:"settled",geometryProgress:1,paletteProgress:1,siteProgress:1,programReady:true,visualPublished:true,targetNodeId:"05.6",endpointKey:"05.6"},20);
  for(const nowMs of [300,350,500,700]) controller.tick({nowMs,scrollY:0,viewportHeight:900,observedNodeId:"05.7",magneticCandidateId:"05.7",pendingTarget:null,mode:"idle",gestureActive:false,snapAnimationPending:false,layoutRevision:1,distanceToAnchorPx:0});
  assert.equal(controller.consumeBegin()?.nodeId,"05.7");
});

test("retarget captures the drawn pair, progress and fractional visible scale even when session is ahead", () => {
  const state = (id: string) => {
    const {entry,ns}=entries.find(({entry})=>entry.stateId===id)!;
    return decodeState(entry,buffer(read(`${ns}/${entry.bufferPath}`)));
  };
  const source=state("single-games"), target=state("single-video");
  const program=compileTransition(source,target,{
    schemaVersion:"1.0.0",sourceStateId:source.entry.stateId,targetStateId:target.entry.stateId,
    identitySpaceVersion:"ps03m3-identity-v1",motionProfileId:"directed-plastic-release",triggerMode:"qa",viewportProfile:"desktop",
    directionIntent:"auto",deterministicSeed:123,reducedMotion:false,
  });
  const session=new PhotonicMotionSession();
  session.bootstrapSettled(target,program);
  const progress=.43;
  const captured=session.captureJoint({source,target,program,progress});
  assert.equal(captured.geometryProgress,progress);
  assert.equal(captured.renderedPair?.source,source);
  let fractional=0;
  for(let id=0;id<16384;id++) {
    const value=evaluateElement(source,target,program,id,progress);
    const floor=program.compiled?.header.activationPolicy.minimumGeometricScale ?? .18;
    const expected=value.scale*value.activation*(floor+(1-floor)*value.activation);
    assert.ok(Math.abs(captured.m4Snapshot!.scale[id]-expected)<1e-5);
    if(value.activation>0 && value.activation<1) {
      fractional++;
      assert.equal(captured.m4Snapshot!.status[id],0);
    }
  }
  assert.ok(fractional>0);
});
