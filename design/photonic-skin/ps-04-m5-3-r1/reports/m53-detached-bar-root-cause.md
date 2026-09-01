# M5.3 detached bar — confirmed root cause

Original M5.3 combo authoring placed `slate-hinged-bar` with:

```text
hinge point: [-0.48, -0.02, 0.36]
hinged bar transform:
translate = [0.02, -0.22, 0.52]
rotateDeg = [-34°, 0°, 0°]
```

That construction is mechanically wrong:

1. The long axis of the bar is approximately local `X`.
2. Rotation around `X` twists the bar around its own long axis and does not lift the free end.
3. The nested transform is applied around the bar centre, not around the hinge point.
4. The centre is pre-translated away from the board, so the whole stick floats.
5. The root end does not coincide with the hinge envelope.
6. Metadata `connectivityRole: attached` does not create visual contact.
7. In canonical and alternate views the bar is a separate silhouette island.

Measured min distance from original combo-30 bar cloud to hinge (world, pre-yaw): 0.5525.
Measured min distance from bar cloud to rail cloud: 0.3486.
Dot of PCA long axis with local `u`: 1.000.

R1 replaces this with pivot-aware construction: `d0 = +u`, rotation around board normal `n` through hinge `H`, open angle 30° with `dot(d, v) > 0`.
