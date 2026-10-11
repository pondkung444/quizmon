import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generateConstruction } from "../../src/lib/farm/construction-puzzles.ts";
const browser = await chromium.launch({ headless: true });
let checks = 0;
const errors = [];
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync("test-results/farm-phase3", { recursive: true });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const kind of ["construction-floor", "construction-path"]) {
      await page.goto("http://localhost:3107/collection/preview?kind=" + kind);
      await page
        .getByRole("button", { name: "คำใบ้ 1", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      checks++;
      await page.getByRole("button", { name: "คำใบ้ 1", exact: true }).focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("status")
        .filter({
          hasText:
            kind === "construction-floor" ? "เริ่มจากแผ่น" : "เริ่มตามลูกศร",
        })
        .first()
        .waitFor();
      checks++;
      if (kind === "construction-floor") {
        const p = generateConstruction(kind, 17445);
        assert.equal(
          await page
            .locator('[aria-label="ถาดกระเบื้อง 4 ชิ้น"] button:disabled')
            .count(),
          1,
        );
        checks++;
        await page
          .getByRole("button", { name: "✓ ตรวจงาน", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: "ยังมีแผ่นพื้น" })
          .first()
          .waitFor();
        checks++;
      }
      await page.screenshot({
        path: `test-results/farm-phase3/${kind}-${viewport.width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  for (const kind of ["construction-floor", "construction-path"]) {
    const puzzle = generateConstruction(kind, 17445);
    await page.goto("http://localhost:3107/collection/preview?kind=" + kind);
    const names = {
      sun: "ดอกทอง",
      leaf: "ใบไม้",
      water: "สายน้ำ",
      stone: "อเมทิสต์",
    };
    for (const tile of puzzle.solution) {
      if (puzzle.kind === "construction-floor" && tile.id === puzzle.fixed.id)
        continue;
      const tray =
        kind === "construction-floor"
          ? page
              .locator('[aria-label="ถาดกระเบื้อง 4 ชิ้น"]')
              .getByRole("button", { name: new RegExp(names[tile.id]) })
          : page.getByRole("button", {
              name: new RegExp(
                "^ชิ้น " +
                  ([
                    "straight-a",
                    "straight-b",
                    "bend-a",
                    "bend-b",
                    "bend-c",
                  ].indexOf(tile.id) +
                    1) +
                  " ",
              ),
            });
      if ((await tray.getAttribute("aria-pressed")) !== "true")
        await tray.click();
      for (let n = 0; n < tile.rotation; n++)
        await page.getByRole("button", { name: "↻ หมุน", exact: true }).click();
      await page
        .locator(
          `[data-${kind === "construction-floor" ? "floor" : "garden"}-cell="${tile.x},${tile.y}"]`,
        )
        .click();
      if (kind === "construction-path")
        await page
          .getByRole("button", { name: "✓ ยืนยันวาง", exact: true })
          .click();
    }
    await page
      .getByRole("button", {
        name: kind === "construction-floor" ? "✓ ตรวจงาน" : "เดินไปม้านั่ง →",
        exact: true,
      })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "ผ่านผังจำลอง" })
      .first()
      .waitFor();
    checks++;
  }
  assert.deepEqual(errors, []);
  checks++;
  console.log(`Construction browser: ${checks} checks passed (synthetic only)`);
} finally {
  await browser.close();
}
