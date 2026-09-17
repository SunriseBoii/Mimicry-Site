import { BufferGeometry, Float32BufferAttribute } from "three";

/** A shallow convex diamond with a narrow solid rim, in the particle's tangent plane. */
export function createR2ScaleGeometry() {
  const ring = [[1.18, 0], [0, 0.86], [-1.18, 0], [0, -0.86]];
  const positions: number[] = [];
  const triangle = (...vertices: number[][]) => positions.push(...vertices.flat().map(value => value * 0.035));
  for (let i = 0; i < 4; i++) {
    const a = ring[i], b = ring[(i + 1) % 4];
    const upperA = [...a, 0.025], upperB = [...b, 0.025];
    const lowerA = [...a, -0.025], lowerB = [...b, -0.025];
    triangle([0, 0, 0.28], upperA, upperB);
    triangle([0, 0, -0.10], lowerB, lowerA);
    triangle(upperA, lowerA, lowerB);
    triangle(upperA, lowerB, upperB);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.setAttribute("aSurfaceNormal", geometry.getAttribute("normal"));
  return geometry;
}
