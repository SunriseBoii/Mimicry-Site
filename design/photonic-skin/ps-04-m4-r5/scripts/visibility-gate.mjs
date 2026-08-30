const GRAPH = 92;
const HEADER = 72;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function actorSquareCss(width, height) {
  const graph = width < 720 ? 56 : GRAPH;
  const usableWidth = Math.max(160, width - graph - 24);
  const usableHeight = Math.max(160, height - HEADER);
  const fraction = width < 720 ? 0.68 : width < 1366 ? 0.35 : 0.36;
  const sized = width * fraction;
  return clamp(sized, 168, Math.min(usableWidth * 0.92, usableHeight * 0.86));
}

function placementCenter(slot, width, height) {
  const graph = width < 720 ? 56 : GRAPH;
  const rest = height - HEADER;
  const idleY = width < 720 ? HEADER + rest * 0.58 : HEADER + rest * 0.52;
  const size = actorSquareCss(width, height);
  const half = size / 2;
  const maxRightCenter = width - graph - 10 - half;
  const minLeftCenter = half + 12;
  const rightX = width < 720
    ? clamp(width * 0.5, minLeftCenter, maxRightCenter)
    : clamp(width * 0.76, minLeftCenter, maxRightCenter);
  const leftX = width < 720
    ? clamp(width * 0.46, minLeftCenter, maxRightCenter)
    : clamp(width * 0.245, minLeftCenter, Math.min(width * 0.3, maxRightCenter));
  if (slot === "left") return { x: leftX, y: idleY };
  return { x: rightX, y: idleY };
}

export function actorVisibilityGate(args) {
  const failures = [];
  if (args.actorDraw && !args.bbox) failures.push("draw-without-silhouette");
  if (args.actorDraw && args.visibleFraction < 0.98) failures.push("silhouette-outside-canvas");
  const bbox = args.bbox;
  if (args.actorDraw && bbox) {
    const epsilon = 1.5;
    const visibleLeft = Math.max(bbox.left, 0);
    const visibleTop = Math.max(bbox.top, 0);
    const visibleRight = Math.min(bbox.right, args.canvasWidth);
    const visibleBottom = Math.min(bbox.bottom, args.canvasHeight);
    const visibleW = Math.max(0, visibleRight - visibleLeft);
    const visibleH = Math.max(0, visibleBottom - visibleTop);
    const area = Math.max(1e-6, bbox.width * bbox.height);
    const outsideFraction = 1 - (visibleW * visibleH) / area;
    const touches = bbox.left <= epsilon
      || bbox.top <= epsilon
      || bbox.right >= args.canvasWidth - epsilon
      || bbox.bottom >= args.canvasHeight - epsilon;
    if (touches && outsideFraction > 0.02) failures.push("silhouette-clipped-by-canvas");
    const maxDim = Math.max(bbox.width, bbox.height);
    const minVw = args.canvasWidth < 720 ? args.canvasWidth * 0.4 : args.canvasWidth * 0.18;
    if (maxDim + 2 < minVw) failures.push("actor-too-small");
  }
  if (args.actorDraw && args.slot !== "none" && args.slot !== "exit" && args.slot) {
    const expected = placementCenter(args.slot, args.canvasWidth, args.canvasHeight);
    if (Math.abs(args.centerX - expected.x) > args.canvasWidth * 0.08) failures.push("center-outside-slot");
  }
  if (args.cssLeftByDpr?.length > 1) {
    const baseLeft = args.cssLeftByDpr[0];
    const baseSize = args.cssSizeByDpr[0];
    args.cssLeftByDpr.forEach((left, index) => {
      if (Math.abs(left - baseLeft) > 2) failures.push(`css-left-dpr-drift:${index}`);
    });
    args.cssSizeByDpr.forEach((size, index) => {
      if (Math.abs(size - baseSize) > 2) failures.push(`css-size-dpr-drift:${index}`);
    });
  }
  if (!args.actorDraw && (args.slot === "none" || args.slot === "exit")) {
    if (args.bbox && args.bbox.pixelCount > 12) failures.push("footer-has-silhouette");
    return { pass: failures.length === 0, failures };
  }
  return { pass: failures.length === 0, failures };
}
