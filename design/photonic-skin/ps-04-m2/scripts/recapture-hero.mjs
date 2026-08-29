import { chromium } from "playwright-core";
import path from "node:path";

const OUT = path.join(process.cwd(), "design/photonic-skin/ps-04-m2/renders/browser");
const BASE = process.env.PS04M2_BASE ?? "http://localhost:3000";
const PREVIEW = `${BASE}/visual-lab/photonic-skin-ps04-m2/preview`;

async function main() {
  const browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  try {
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${PREVIEW}?theme=${theme}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForFunction((expected) => {
        const root = document.querySelector("main[data-theme]");
        const hero = document.querySelector(`section[data-theme='${expected}']`);
        return Boolean(root?.dataset.theme === expected && hero);
      }, theme, { timeout: 25000 });
      await page.waitForFunction(() => window.__PS04M2_SCENE_READY__ === true, null, { timeout: 25000 });
      await page.waitForTimeout(1400);
      const probe = await page.evaluate((expected) => {
        const hero = document.querySelector(`section[data-theme='${expected}']`);
        const style = hero ? getComputedStyle(hero) : null;
        const active = document.querySelector("[data-active='true']")?.textContent ?? "";
        const rgb = style?.backgroundColor ?? "";
        return {
          active,
          dataTheme: document.querySelector("main")?.dataset.theme ?? "",
          background: rgb,
          ready: Boolean(window.__PS04M2_SCENE_READY__),
        };
      }, theme);
      process.stdout.write(`desktop ${theme} ${JSON.stringify(probe)}\n`);
      if (theme === "dark" && !/rgb\(\s*9,\s*11,\s*13\s*\)/.test(probe.background)) {
        throw new Error(`Dark hero background is ${probe.background}, expected rgb(9, 11, 13)`);
      }
      if (theme === "light" && !/rgb\(\s*245,\s*242,\s*235\s*\)/.test(probe.background)) {
        throw new Error(`Light hero background is ${probe.background}, expected rgb(245, 242, 235)`);
      }
      await page.screenshot({ path: path.join(OUT, `hero-desktop-${theme}.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `hero-mobile-${theme}.png`) });
      process.stdout.write(`captured hero ${theme}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
