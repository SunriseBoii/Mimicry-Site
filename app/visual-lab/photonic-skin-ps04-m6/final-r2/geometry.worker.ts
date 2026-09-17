import { compileLiveRetarget, M3_SEED } from "../../photonic-skin-ps04-m3/runtime";
import { PhotonicMotionSession } from "../../photonic-skin-ps04-m3/session";
import { compileTransition } from "../../photonic-skin-m4-1/m41-evaluator";
import type { M3Manifest } from "../../photonic-skin-m4-1/m41-data";
import type { GeometryJob } from "./geometry-worker-client";

self.onmessage = (event: MessageEvent<GeometryJob>) => {
  try {
    const job = event.data;
    if (job.captured && job.rendered) {
      const capture = new PhotonicMotionSession().captureJoint(job.rendered);
      const result = compileLiveRetarget({...job.captured, m4Snapshot:capture.m4Snapshot}, job.source, job.target,
        {identitySpace:job.identitySpace} as M3Manifest, {reducedMotion:job.reducedMotion,viewport:job.viewport});
      self.postMessage(result);
    } else {
      const program = compileTransition(job.source, job.target, {
        schemaVersion:"1.0.0",sourceStateId:job.source.entry.stateId,targetStateId:job.target.entry.stateId,
        identitySpaceVersion:job.identitySpace.identitySpaceVersion,motionProfileId:"directed-plastic-release",
        triggerMode:"qa",viewportProfile:job.viewport,directionIntent:"auto",deterministicSeed:M3_SEED,reducedMotion:job.reducedMotion,
      });
      self.postMessage({liveSource:job.source,program});
    }
  } catch (error) { self.postMessage({error:error instanceof Error ? error.message : String(error)}); }
};
