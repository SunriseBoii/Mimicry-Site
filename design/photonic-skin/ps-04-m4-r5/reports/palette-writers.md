# Palette writers — PS-04.M4.R5

R4 PaletteAuthority is unchanged. GeometryAuthority is the symmetric snapshot. Scene `useFrame` writes one palette snapshot and one geometry snapshot into uniforms on the same frame.

R4 writers remain:

| Writer | Role |
| --- | --- |
| Session tick → geometry-linked progress | Intercepted; native stored on `Symbol.for("ps04m4.nativeSetGeometryLinkedProgress")` |
| Lab clock → `applyLinkedPalette` | Transient blend only while `status === "running"` |
| `commitTargetAsSettled()` then `commitDriverToMask` | Atomic target LUT before ownership off |
| Scene `useFrame` | Palette snapshot + geometry snapshot, one uniform commit |
| `requestActor` `setMask(..., geometry-linked)` | Starts driver target |

Geometry writers after R5:

| Writer | Role |
| --- | --- |
| Session `geometryProgress` | Transaction clock only. Not the Scene uniform while waiting. |
| `displayedBind.shaderProgress` | Authority for displayed `uProgress` |
| Scene atomic bind | Textures + `uProgress` in one commit |
| Prewarm / cache | Compile and store immutable program copies. Must not bind or mutate displayed textures. |
