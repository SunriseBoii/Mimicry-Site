import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const out = path.join(root, "design/photonic-skin/ps-04-final-r1/reports");
const frames = path.join(root, "design/photonic-skin/ps-04-final-r1/renders/builder");
mkdirSync(out, { recursive: true });
mkdirSync(frames, { recursive: true });
const base = process.env.PS04_BASE ?? "http://localhost:3001";
const url = process.env.PS04_BUILDER_URL ?? `${base}/visual-lab/photonic-skin-ps04-m6/final-r1/review`;
const order = ["content", "design", "digital", "event", "games", "merch", "video"];
const observations = [];

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => pageErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  try {
    await page.waitForFunction(() => Boolean(window.__PS04M61_LAB__?.ready), null, { timeout: 40000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      handle: window.__PS04M61_LAB__ ? {
        ready: window.__PS04M61_LAB__.ready,
        loading: window.__PS04M61_LAB__.loading,
        loadStatus: window.__PS04M61_LAB__.loadStatus,
        error: window.__PS04M61_LAB__.error,
      } : null,
      body: document.body.innerText.slice(0, 500),
    }));
    throw new Error(`Lab not ready: ${JSON.stringify(state)}; pageErrors=${JSON.stringify(pageErrors)}; ${error}`);
  }

  async function go(node) {
    await page.evaluate((value) => window.__PS04M61_LAB__.scrollToNode(value, "auto", "restore"), node);
    await page.waitForTimeout(120);
  }
  async function expectState(label, state, screenshot = false) {
    try {
      await page.waitForFunction((target) => {
        const handle = window.__PS04M61_LAB__;
        const geometry = handle?.geometrySnapshot?.();
        const transaction = handle?.transaction?.();
        return document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state") === target
          && geometry?.settledGeometryId === target
          && transaction?.visualLifecycle === "settled"
          && handle?.actorFramebufferReady === true;
      }, state, { timeout: 30000 });
    } catch (error) {
      const actual = await page.evaluate(() => ({
        canvas: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state"),
        node: window.__PS04M61_LAB__?.activeNode,
        builder: window.__PS04M61_LAB__?.builder,
        loadStatus: window.__PS04M61_LAB__?.loadStatus,
        geometry: window.__PS04M61_LAB__?.geometrySnapshot?.(),
        transaction: window.__PS04M61_LAB__?.transaction?.(),
      }));
      throw new Error(`${label}: expected ${state}; observed ${JSON.stringify(actual)}; ${error}`);
    }
    const observed = await page.evaluate(() => ({
      resolved: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-resolved-state"),
      hash: document.querySelector("[data-qa='m4-canvas']")?.getAttribute("data-buffer-hash"),
      activeNode: window.__PS04M61_LAB__?.activeNode ?? null,
      settledGeometryId: window.__PS04M61_LAB__?.geometrySnapshot?.()?.settledGeometryId ?? null,
      theme: document.documentElement.dataset.theme ?? null,
    }));
    if (observed.resolved !== state) throw new Error(`${label}: ${observed.resolved} != ${state}`);
    observations.push({ label, expected: state, ...observed });
    if (screenshot) await page.screenshot({ path: path.join(frames, `${label}.png`) });
  }
  async function click(qa) {
    await page.locator(`[data-qa='${qa}']`).click({ timeout: 20000 });
  }

  await page.evaluate(() => window.__PS04M61_LAB__.resetFlow());
  await go("03.1");
  await expectState("03-1-master", "master-neutral", true);
  await click("task-explain_changes");
  await expectState("03-1-after-task-master", "master-neutral");
  await go("03.2");
  await expectState("03-2-empty-master", "master-neutral");

  for (let count = 1; count <= 7; count += 1) {
    await click(`competence-${order[count - 1]}`);
    const selected = order.slice(0, count);
    const state = count === 1 ? `single-${selected[0]}` : `complex-gather-${selected.join("-")}`;
    await expectState(`03-2-${count}-competencies`, state, count === 1 || count === 2 || count === 7);
  }
  await click("confirm-competencies");
  await go("03.3");
  await expectState("03-3-seven-drive", `complex-drive-${order.join("-")}`, true);

  await go("03.2");
  await click("competence-event");
  const six = order.filter((value) => value !== "event");
  await expectState("03-2-draft-six", `complex-gather-${six.join("-")}`);
  await go("03.3");
  await expectState("03-3-confirmed-unchanged", `complex-drive-${order.join("-")}`, true);
  await go("03.2");
  await click("confirm-competencies");
  await go("03.3");
  await expectState("03-3-six-reconfirmed", `complex-drive-${six.join("-")}`);

  await page.evaluate(() => window.__PS04M61_LAB__.resetFlow());
  await go("03.1");
  await click("task-engage_and_unite");
  await go("03.2");
  await click("competence-event");
  await expectState("03-2-single-event", "single-event", true);
  await click("confirm-competencies");
  await go("03.3");
  await expectState("03-3-single-event", "single-event", true);
  await go("05.3");
  await expectState("05-3-event-r3", "single-event", true);

  writeFileSync(path.join(out, "builder-real-buttons.json"), JSON.stringify({
    ok: true,
    url,
    runHash: createHash("sha256").update(JSON.stringify(observations)).digest("hex"),
    observations,
  }, null, 2) + "\n");
  console.log(`builder real buttons PASS (${observations.length} states)`);
} finally {
  await browser.close();
}
