# Transition contract — PS-04.M4.R5

One navigation token per semantic screen change. Raw `activeNodeId` does not create an actor request. Magnetic candidate and committed node share the token.

Geometry:

- Displayed endpoint is `GeometryAuthority` (`geometrySnapshot()`), not raw session progress.
- After settle the bound pair stays at `shaderProgress = 1` indefinitely.
- `activeTransition = null` does not clear the displayed program.
- Compile gap holds previous `@ t=1` until `programReady` and atomic bind.
- Atomic bind: all textures + `uProgress = 0` in one Scene commit, then running.
- `selectProgramSourceMode`: while displayed `shaderProgress >= 1`, the next frozen program source is the displayed endpoint even if session progress is 0.
- Live retarget only while a morph is actually running (`shaderProgress < 1`).
- Stale revision cannot bind or settle.
- Render acknowledgment is a ref/runtime object, not a React state update every frame.

Palette R4 contract is unchanged: target LUT atomic commit, `ownership = 0` after settle, `shaderProgress = 1`, unselected competence weight 0.

Continuity lift remains off unless `?continuityLift=1`.
