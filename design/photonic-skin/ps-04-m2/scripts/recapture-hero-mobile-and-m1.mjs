import { chromium } from "playwright-core";
import path from "node:path";

const BASE = process.env.PS04M2_BASE ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "design/photonic-skin/ps-04-m2/renders/browser");

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/visual-lab/photonic-skin-ps04-m2/preview?theme=dark`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(() => {
      const hero = document.querySelector("section[data-theme='dark']");
      const compiling = document.body.innerText.includes("Rendering...");
      return Boolean(hero && window.__PS04M2_SCENE_READY__ && !compiling);
    }, null, { timeout: 40000 });
    await page.waitForTimeout(800);
    const probe = await page.evaluate(() => ({
      theme: document.querySelector("main")?.dataset.theme,
      background: document.querySelector("section[data-theme='dark']")
        ? getComputedStyle(document.querySelector("section[data-theme='dark']")).backgroundColor
        : "",
      compiling: document.body.innerText.includes("Rendering..."),
    }));
    process.stdout.write(`mobile dark ${JSON.stringify(probe)}\n`);
    await page.screenshot({ path: path.join(OUT, "hero-mobile-dark.png") });

    await page.setViewportSize({ width: 1440, height: 920 });
    await page.goto(`${BASE}/visual-lab/photonic-skin-ps04-m1`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const loading = document.body.innerText.includes("Loading frozen actor");
      return Boolean(canvas && canvas.width > 8 && !loading);
    }, null, { timeout: 40000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, "legacy-m1-route.png") });
    process.stdout.write("captured legacy M1\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
