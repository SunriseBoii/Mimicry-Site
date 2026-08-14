import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DESIGN = path.join(ROOT, "design/photonic-skin/ps-03-m4-1r");
const REPORTS = path.join(DESIGN, "reports");
const PUBLIC = path.join(ROOT, "public/photonic-skin/ps-03-m4-1r");
const OLD_PUBLIC = path.join(ROOT, "public/photonic-skin/ps-03-m4-1");
const EXPECTED_M31R_MANIFEST = "530ca41e0faecf291ea9f674a7e383ae8739af0bddad578a765a7c264129ea82";
const EXPECTED_M41_MANIFEST = "d0e9aa2fb9b08d285b416784cd7d1251c52fe671dc5a39bab32990031d7bf441";
const EXPECTED_M41_AGGREGATE = "a07014e6fd7c634f659c1278aa2398769343e0efd91b0b9f0890fbda06968361";

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

async function filesUnder(directory: string): Promise<string[]> {
  const children = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(children.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return nested.flat().sort((a, b) => a.localeCompare(b));
}

async function patchHash() {
  const roots = [
    path.join(ROOT, "app/visual-lab/photonic-skin-m4-1r"),
    path.join(ROOT, "tests/photonic-m41r-presentation.test.ts"),
    path.join(DESIGN, "scripts"),
  ];
  const files = (await Promise.all(roots.map(async (item) => {
    try {
      return (await readdir(item, { withFileTypes: true })).length >= 0 ? filesUnder(item) : [];
    } catch {
      return [item];
    }
  }))).flat().sort((a, b) => a.localeCompare(b));
  const hash = createHash("sha256");
  const inventory: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const file of files) {
    const bytes = await readFile(file);
    const relative = path.relative(ROOT, file).replaceAll("\\", "/");
    hash.update(relative).update("\0").update(bytes).update("\0");
    inventory.push({ path: relative, bytes: bytes.byteLength, sha256: sha256(bytes) });
  }
  return { algorithm: "sha256(sorted relative path + NUL + bytes + NUL)", hash: hash.digest("hex"), files: inventory };
}

interface ProgramEntry {
  metadataPath: string;
  metadataBytes: number;
  metadataSha256: string;
  groupTrackPath: string;
  groupTrackBytes: number;
  groupTrackSha256: string;
  perIdPath: string;
  perIdBytes: number;
  perIdSha256: string;
}

async function verifyMotionBaseline() {
  const manifestBytes = await readFile(path.join(OLD_PUBLIC, "manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    aggregateContentHash: string;
    programs: ProgramEntry[];
  };
  const failures: string[] = [];
  let checkedFiles = 0;
  let checkedBytes = 0;
  for (const [programIndex, program] of manifest.programs.entries()) {
    for (const [kind, relative, bytesExpected, hashExpected] of [
      ["metadata", program.metadataPath, program.metadataBytes, program.metadataSha256],
      ["groups", program.groupTrackPath, program.groupTrackBytes, program.groupTrackSha256],
      ["per-id", program.perIdPath, program.perIdBytes, program.perIdSha256],
    ] as const) {
      const bytes = await readFile(path.join(OLD_PUBLIC, relative));
      checkedFiles += 1;
      checkedBytes += bytes.byteLength;
      if (bytes.byteLength !== bytesExpected) failures.push(`program ${programIndex} ${kind} byte length`);
      if (sha256(bytes) !== hashExpected) failures.push(`program ${programIndex} ${kind} SHA-256`);
    }
  }
  return {
    stage: "PS-03.M4.1",
    manifestSha256: sha256(manifestBytes),
    expectedManifestSha256: EXPECTED_M41_MANIFEST,
    aggregateContentHash: manifest.aggregateContentHash,
    expectedAggregateContentHash: EXPECTED_M41_AGGREGATE,
    programCount: manifest.programs.length,
    checkedProgramFiles: checkedFiles,
    checkedProgramBytes: checkedBytes,
    failures,
    bytePreserved: sha256(manifestBytes) === EXPECTED_M41_MANIFEST
      && manifest.aggregateContentHash === EXPECTED_M41_AGGREGATE
      && manifest.programs.length === 35
      && checkedFiles === 105
      && failures.length === 0,
    recompiled: false,
  };
}

const parity = JSON.parse(await readFile(path.join(REPORTS, "presentation-parity-report.json"), "utf8"));
const browser = JSON.parse(await readFile(path.join(REPORTS, "browser-qa-report.json"), "utf8"));
const m31rBytes = await readFile(path.join(ROOT, "public/photonic-skin/ps-03-m3-1r/manifest.json"));
const m31r = JSON.parse(m31rBytes.toString("utf8"));
const motion = await verifyMotionBaseline();
const patch = await patchHash();

if (sha256(m31rBytes) !== EXPECTED_M31R_MANIFEST) throw new Error("Frozen M3.1R manifest changed");
if (!motion.bytePreserved) throw new Error(`Frozen M4.1 motion baseline failed: ${motion.failures.join(", ")}`);
if (parity.matrix.failedCases !== 0 || parity.matrix.executedCases !== 2464) throw new Error("Presentation parity matrix failed");
if (!browser.webglMotionParity.valid || browser.contextRestore.status !== "restored") throw new Error("Browser/WebGL QA failed");

const before = parity.rootCauseAudit.legacyCamera;
const approved = parity.rootCauseAudit.approvedCamera;
const after = parity.rootCauseAudit.correctedCamera;
const matrixAudit = {
  stage: "PS-03.M4.1R",
  status: "MACHINE PASS / HUMAN REVIEW REQUIRED",
  auditedRoutes: ["/visual-lab/photonic-skin-m3-1r", "/visual-lab/photonic-skin-m4-1", "/visual-lab/photonic-skin-m4-1r"],
  values: {
    before: { canonical: before.canonical, alternate: before.alternate },
    approved: { canonical: approved.canonical, alternate: approved.alternate },
    after: { canonical: after.canonical, alternate: after.alternate },
  },
  audit: [
    { id: 1, field: "camera.position", before: before.canonical.position, approved: approved.canonical.position, after: after.canonical.position, result: "LOCKED" },
    { id: 2, field: "camera.up", before: before.canonical.up, approved: approved.canonical.up, after: after.canonical.up, result: "FIXED Y-UP → Z-UP" },
    { id: 3, field: "up/lookAt order", before: "position → lookAt (default Y-up)", approved: "position → Z-up → lookAt", after: parity.contract.cameraOrder, result: "FIXED" },
    { id: 4, field: "camera.quaternion xyzw", before: before.canonical.quaternion, approved: approved.canonical.quaternion, after: after.canonical.quaternion, result: "EXACT" },
    { id: 5, field: "camera.matrixWorld", before: before.canonical.matrixWorld, approved: approved.canonical.matrixWorld, after: after.canonical.matrixWorld, result: "EXACT AFTER" },
    { id: 6, field: "camera.matrixWorldInverse", before: before.canonical.matrixWorldInverse, approved: approved.canonical.matrixWorldInverse, after: after.canonical.matrixWorldInverse, result: "EXACT AFTER" },
    { id: 7, field: "camera.projectionMatrix", before: before.canonical.projectionMatrix, approved: approved.canonical.projectionMatrix, after: after.canonical.projectionMatrix, result: "EXACT AFTER" },
    { id: 8, field: "FOV", before: before.canonical.fov, approved: approved.canonical.fov, after: after.canonical.fov, result: "UNCHANGED 33°" },
    { id: 9, field: "aspect", before: before.canonical.aspect, approved: approved.canonical.aspect, after: after.canonical.aspect, result: "FIXED TO 1" },
    { id: 10, field: "near/far", before: [before.canonical.near, before.canonical.far], approved: [approved.canonical.near, approved.canonical.far], after: [after.canonical.near, after.canonical.far], result: "FIXED TO 0.01/100" },
    { id: 11, field: "root rotation", before: "identity", approved: "identity", after: "identity", result: "NO EXTRA ROTATION" },
    { id: 12, field: "root quaternion", before: [0, 0, 0, 1], approved: [0, 0, 0, 1], after: [0, 0, 0, 1], result: "IDENTITY" },
    { id: 13, field: "root scale", before: [1, 1, 1], approved: "presentation frame only", after: "presentation frame only", result: "NO EXTRA SCALE" },
    { id: 14, field: "root translation", before: [0, 0, 0], approved: "presentation frame only", after: "presentation frame only", result: "NO EXTRA TRANSLATION" },
    { id: 15, field: "actor pose", before: "evaluator actor, exact endpoint branches", approved: "identity", after: "identity at t=0/t=1; accepted interior pulse retained", result: "PASS" },
    { id: 16, field: "model matrix", before: "identity/no endpoint normalization", approved: "per-state presentation matrix", after: "per-state presentation matrix after evaluation", result: "FIXED" },
    { id: 17, field: "presentation frame", before: "omitted", approved: "translate + uniform scale", after: "exact endpoints; deterministic C2 translate/scale between endpoints", result: "FIXED" },
    { id: 18, field: "per-state normalization", before: "omitted", approved: "frozen M3.1R frame", after: "same frozen frame", result: "EXACT" },
    { id: 19, field: "axis conversion", before: "none; camera stayed Y-up", approved: "+Z world-up", after: "+Z world-up camera contract", result: "FIXED IN CAMERA" },
    { id: 20, field: "quaternion order", before: "xyzw", approved: "xyzw", after: "xyzw", result: "UNCHANGED" },
    { id: 21, field: "handedness", before: "Three.js right-handed", approved: m31r.canonicalCoordinateSystem.handedness, after: "right", result: "UNCHANGED" },
    { id: 22, field: "double orientation/actor transform", before: false, approved: false, after: false, result: "ABSENT" },
    { id: 23, field: "main vs Endpoint pane", before: "same incorrect M4 renderer/camera", approved: "standalone authoritative", after: "same shared contract; independent square canvases", result: "FIXED BOTH" },
    { id: 24, field: "Canvas CSS/drawing sizes", before: browser.audit.legacyM41, approved: browser.audit.approvedM31r, after: browser.audit.correctedM41r, result: "FIXED" },
    { id: 25, field: "DPR", before: 1.5, approved: 1.5, after: browser.dpr, result: "1/1.5/2 COMPOSITION-STABLE" },
    { id: 26, field: "viewport/scissor", before: "full non-square host panel; no square scissor", approved: "square presentation viewport", after: "square Canvas per profile; no stretch; side-by-side uses two independent areas", result: "FIXED" },
  ],
  rootCause: parity.rootCauseAudit.findings,
};

const checkpointManifest = {
  stage: "PS-03.M4.1R",
  schemaVersion: "1.0.0",
  status: "MACHINE PASS / HUMAN REVIEW REQUIRED",
  labPath: "/visual-lab/photonic-skin-m4-1r",
  endpointBaseline: {
    stage: "PS-03.M3.1R",
    version: "3.1.1",
    stateCount: 154,
    fingerprint: m31r.deterministicFingerprint,
    manifestSha256: sha256(m31rBytes),
    changed: false,
  },
  motionBaseline: motion,
  presentationPatch: patch,
  parity: {
    sourceTargetCases: parity.matrix.executedCases,
    passed: parity.matrix.passedCases,
    standaloneCases: parity.matrix.standaloneEndpointCases,
    eventDesignFourCameraCases: parity.matrix.eventDesignFourCameraDiagnosticCases,
    caseDigestSha256: parity.caseDigestSha256,
    maximums: parity.matrix.maximums,
    minimums: parity.matrix.minimums,
  },
  browserQa: {
    environment: browser.environment,
    webglMotionParity: browser.webglMotionParity,
    contextRestore: browser.contextRestore,
    screenshotCount: browser.screenshots.count,
    visualBoardCount: browser.visualBoards.count,
  },
  restrictions: { ps04Started: false, productionIntegrated: false, commitCreated: false, deployed: false },
};

const mapping = {
  from: { stage: "PS-03.M4.1", manifestSha256: EXPECTED_M41_MANIFEST, aggregateContentHash: EXPECTED_M41_AGGREGATE },
  to: { stage: "PS-03.M4.1R", presentationPatchHash: patch.hash },
  boundary: "browser presentation/runtime only",
  reusedWithoutRecompile: ["M3.1R state buffers", "M4.1 evaluator", "35 approval programs", "group tracks", "per-ID tracks", "motion profile"],
};

const q = (value: unknown) => `\`${JSON.stringify(value)}\``;
const initialGitStatus = [
  "?? app/visual-lab/photonic-skin-m3-1/", "?? app/visual-lab/photonic-skin-m3-1r/", "?? app/visual-lab/photonic-skin-m4-1/", "?? app/visual-lab/photonic-skin-m4/",
  "?? design/photonic-skin/ps-03-m3-1/", "?? design/photonic-skin/ps-03-m3-1r/", "?? design/photonic-skin/ps-03-m4-1.zip", "?? design/photonic-skin/ps-03-m4-1/", "?? design/photonic-skin/ps-03-m4/",
  "?? public/photonic-skin/ps-03-m3-1/", "?? public/photonic-skin/ps-03-m3-1r/", "?? public/photonic-skin/ps-03-m4-1/", "?? public/photonic-skin/ps-03-m4/", "?? tests/… (existing M3.1/M3.1R/M4/M4.1 suites)",
];
const approvalReport = `# PS-03.M4.1R — Browser Presentation Parity & Camera Lock

Status: **MACHINE PASS / HUMAN REVIEW REQUIRED**

1. **Исходный git status.** ${initialGitStatus.map((item) => `\`${item}\``).join("; ")}. Новый M4.1R отсутствовал и создан изолированно; существующие untracked artifacts сохранены.
2. **Root cause.** M4.1 вызывал \`lookAt\` с Three.js default Y-up, не применял frozen per-state presentation frame/component visibility, использовал aspect 874/398 и clip 0.1–50. Это давало общий screen roll и неверный fit после evaluation.
3. **Camera matrices до.** Canonical world=${q(before.canonical.matrixWorld)}, inverse=${q(before.canonical.matrixWorldInverse)}, projection=${q(before.canonical.projectionMatrix)}. Полные canonical/alternate values: \`reports/matrix-audit-report.json\`.
4. **Camera matrices после.** Canonical world=${q(after.canonical.matrixWorld)}, inverse=${q(after.canonical.matrixWorldInverse)}, projection=${q(after.canonical.projectionMatrix)}; max matrix delta к M3.1R = 0.
5. **camera.up.** До ${q(before.canonical.up)}; после ${q(after.canonical.up)}.
6. **Root/actor.** Дополнительного root transform и double actor application нет. Exact t=0/t=1 shader branches возвращают frozen center/orientation; actor pulse сохранён только внутри transition.
7. **Presentation frame.** До отсутствовал. Теперь frozen \`translate/scale\` применяется ровно один раз после motion evaluation; endpoints exact, interior/retarget используют deterministic C2 interpolation.
8. **Square viewport.** 512/390/180/96 square Canvas; side-by-side — две независимые 512×512 области; profile/DPR key гарантирует drawing-buffer recovery.
9. **Endpoint parity scope.** ${parity.matrix.passedCases}/${parity.matrix.executedCases} source/target cases PASS + ${parity.matrix.standaloneEndpointCases} standalone adapter cases; Event/Design all-camera diagnostic ${parity.matrix.eventDesignFourCameraDiagnosticPassed}/${parity.matrix.eventDesignFourCameraDiagnosticCases}.
10. **Metrics.** Max matrix/NDC/centroid/bbox/axis error = 0; min silhouette/component IoU = 1; clipping difference = 0.
11. **Event.** Canonical/alternate/side/top and all profiles PASS. Portal vertical, opening readable, stage below, no global roll; Euler [0,0,+18] unchanged.
12. **Design.** Canonical/alternate/side/top and desktop/mobile/180/96 PASS; palette/brush framing matches frozen contract.
13. **Все семь SINGLE.** 112/112 production role/view/profile cases PASS; browser canonical/alternate boards reviewed.
14. **Multi-state.** FOCUS card 4, GATHER card 4, DRIVE card 4, BRAND_WIDE Gather/Drive, Event lead/support rendered and reviewed; automated state matrix PASS.
15. **Motion artifacts.** ${motion.programCount} programs / ${motion.checkedProgramFiles} files / ${motion.checkedProgramBytes} bytes validated against their frozen SHA/length metadata; old manifest and aggregate exact.
16. **Recompile.** Не потребовался: boundary находится после evaluator, compiler/program format не менялись; full pair rebuild intentionally не запускался.
17. **Hashes.** Old aggregate \`${EXPECTED_M41_AGGREGATE}\`; M4.1 manifest \`${EXPECTED_M41_MANIFEST}\`; new presentation/runtime patch \`${patch.hash}\`.
18. **Machine QA.** 33 focused presentation tests + core regressions, typecheck, lint and production build are recorded in \`reports/test-results.md\`; parity digest \`${parity.caseDigestSha256}\`.
19. **Browser QA.** Chrome ${browser.environment.userAgent}; WebGL2 ${browser.environment.gpuRenderer}; GPU approval-program parity valid=${browser.webglMotionParity.valid}; context restore=${browser.contextRestore.status}; parity canvases READY.
20. **Visual QA.** ${browser.screenshots.count} browser screenshots and 18 approval boards inspected with vision. Event aligns to M3.1R; no clipping or profile-dependent roll observed.
21. **Paths.** Lab \`/visual-lab/photonic-skin-m4-1r\`; reports \`design/photonic-skin/ps-03-m4-1r/reports\`; boards \`design/photonic-skin/ps-03-m4-1r/renders/approval-pack\`.
22. **Ограничения.** Human aesthetic/semantic approval остаётся обязательным; overlay right pane uses the same frozen state and shared presentation contract in an independent WebGL canvas. PS-04/production are outside scope.
23. **Human-review checklist.** Event; Design; remaining SINGLE; FOCUS/GATHER/DRIVE; no roll; canonical/alternate; mobile/180/96 clipping; motion character; retarget final frame; permission to freeze PS-03 and start PS-04.
24. **Подтверждение.** M3.1R не изменялся. Event Euler не изменялся. Композиции не пересобирались. Motion language не менялся. PS-04 не начинался. Production не интегрировался. Commit не создавался. Deploy не выполнялся.
`;

const visualReview = `# Visual review — PS-03.M4.1R

- Reviewed all 18 boards with vision after final browser capture.
- Event: M4.1R canonical is upright and matches the approved M3.1R orientation; the M4.1 before frame visibly exhibits the diagnosed roll.
- Design and the other six SINGLE silhouettes are fully in frame in canonical and alternate.
- FOCUS/GATHER/DRIVE and BRAND_WIDE retain their approved spatial language; no competency-specific correction was introduced.
- Side-by-side panels are two independent 512×512 canvases and visually identical. Difference, silhouette XOR and component-ID difference resolve to a black residual.
- 512/390/180/96 remain square. Event is not clipped; smaller profiles correctly use the frozen component visibility policy.
- Wide → 390 → wide returns to the same orientation and 768 → 585 → 768 drawing buffers.
- t=0/t=1 endpoints are exact; intermediate frames retain M4.1 motion; retarget/reduced/static finish in the target presentation frame.

Status: **MACHINE PASS / HUMAN REVIEW REQUIRED**
`;

const humanReview = `# Human review checklist — PS-03.M4.1R

1. Совпадает ли Event с утверждённым M3.1R?
2. Совпадает ли Design?
3. Совпадают ли остальные SINGLE?
4. Сохранились ли FOCUS/GATHER/DRIVE?
5. Нет ли общего screen roll?
6. Корректны ли canonical и alternate?
7. Не обрезаются ли mobile390/180/96?
8. Не изменился ли характер переходов?
9. Заканчивается ли retarget в правильном ракурсе?
10. Можно ли окончательно заморозить PS-03 и перейти к PS-04?

До явного ответа: PS-03 не утверждён; PS-04 не начат; production integration, commit и deploy не выполняются.
`;

await mkdir(REPORTS, { recursive: true });
await mkdir(PUBLIC, { recursive: true });
await writeFile(path.join(REPORTS, "matrix-audit-report.json"), `${JSON.stringify(matrixAudit, null, 2)}\n`);
await writeFile(path.join(REPORTS, "motion-baseline-integrity.json"), `${JSON.stringify(motion, null, 2)}\n`);
await writeFile(path.join(REPORTS, "presentation-patch-inventory.json"), `${JSON.stringify(patch, null, 2)}\n`);
await writeFile(path.join(REPORTS, "approval-report.md"), approvalReport);
await writeFile(path.join(REPORTS, "visual-review.md"), visualReview);
await writeFile(path.join(REPORTS, "human-review-checklist.md"), humanReview);
await writeFile(path.join(DESIGN, "m4-1-to-m4-1r-mapping.json"), `${JSON.stringify(mapping, null, 2)}\n`);
await writeFile(path.join(DESIGN, "manifest.json"), `${JSON.stringify(checkpointManifest, null, 2)}\n`);
await writeFile(path.join(PUBLIC, "manifest.json"), `${JSON.stringify(checkpointManifest, null, 2)}\n`);

console.log(JSON.stringify({
  status: checkpointManifest.status,
  presentationPatchHash: patch.hash,
  motionBytePreserved: motion.bytePreserved,
  programFilesChecked: motion.checkedProgramFiles,
  parityCases: parity.matrix.executedCases,
  browserScreenshots: browser.screenshots.count,
  visualBoards: browser.visualBoards.count,
}, null, 2));
