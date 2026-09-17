import type { TransitionProgram } from "../visual-lab/photonic-skin-m4-1/m41-evaluator";

/** Remove the whole-actor wind-up while retaining every particle track. */
export function withoutActorAnticipation(program: TransitionProgram): TransitionProgram {
  const compiled = program.compiled;
  if (!compiled || (!compiled.header.actorTrack.rotationRadians && !compiled.header.actorTrack.translationAmplitude)) return program;
  // Keep cached compiler output immutable. Both the renderer and retarget
  // capture must receive this same playback program, so snapshots cannot bake
  // in a rotation that was hidden only in the shader.
  return {
    ...program,
    compiled: {
      ...compiled,
      header: {
        ...compiled.header,
        actorTrack: { ...compiled.header.actorTrack, rotationRadians: 0, translationAmplitude: 0 },
      },
    },
  };
}
