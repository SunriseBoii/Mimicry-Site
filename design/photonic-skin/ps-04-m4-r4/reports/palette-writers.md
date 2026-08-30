# Palette writers — PS-04.M4.R4

Confirmed (code + live uniforms), not hypothesis:

After settle the fragment mix is `mix(sourceLut, targetField(mask), ownership ? vOwnership : progress)`. R3 left progress at 0 and sourceLut at all-seven once ownership was 0.

R4 authority snapshot always sets `shaderProgress = 1` and `shaderSourceLut = settledLut` when settled, then writes those uniforms once per frame. `commitDriverToMask` runs after LUT commit, never as a competing immediate Lab `setMask`.

Hypothesis only: a future M3 session tick that bypasses the symbol intercept could drift driver progress again; Scene would still prefer the coordinator snapshot.
