import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generatePuzzle } from "../../src/lib/farm/puzzle-engine.ts";
const browser = await chromium.launch({ headless: true });
let checks = 0;
const errors = [];
try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.on("pageerror", (e) => errors.push(e.message));
  fs.mkdirSync("test-results/farm-phase2", { recursive: true });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const kind of ["pond", "flower", "bridge", "observatory"]) {
      await page.goto((process.env.FARM_TEST_URL ?? "http://localhost:3107")+"/collection/preview?kind=" + kind);
      await page.getByRole("button", { name: "ตรวจผังนี้" }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${kind} overflow ${viewport.width}`,
      );
      checks++;
      await page.getByRole("button", { name: "คำใบ้ 1", exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "อ่านคำแนะนำ" })
        .waitFor();
      checks++;
      await page.screenshot({
        path: `test-results/farm-phase2/${kind}-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  for (const kind of ["pond", "flower", "bridge", "observatory"]) {
    const p = generatePuzzle(kind, 17445);
    await page.goto((process.env.FARM_TEST_URL ?? "http://localhost:3107")+"/collection/preview?kind=" + kind);
    await page.getByRole("button", { name: "ตรวจผังนี้" }).waitFor();
    // Incomplete submission keeps the existing puzzle and permits another answer.
    await page.getByRole("button", { name: "ตรวจผังนี้" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "แก้ผังจำลองเดิม" })
      .waitFor();
    checks++;
    if (p.kind === "pond")
      for (const t of p.solution) {
        await page
          .getByRole("button", {
            name: t.kind === "I" ? /^ท่อตรง / : /^ท่อโค้ง /,
          })
          .click();
        const cell = page.getByRole("button", {
          name: new RegExp(`^แถว ${t.r + 1} ช่อง ${t.c + 1} `),
        });
        await cell.click();
        for (let i = 0; i < t.rot; i++) await cell.click();
      }
    if (p.kind === "flower") {
      const used = new Set();
      for (const plot of p.plots)
        for (const f of p.factors) {
          const card = p.cards.find(
            (c) =>
              !used.has(c.id) &&
              c.factorId === f.id &&
              c.level === p.needs[`${plot.index}:${f.id}`],
          );
          used.add(card.id);
          await page
            .getByRole("group", { name: plot.plantLabel, exact: true })
            .getByLabel(f.label + " " + plot.plantLabel, { exact: true })
            .selectOption(card.id);
        }
    }
    if (p.kind === "bridge")
      for (const w of p.solutions[0]) {
        const index = p.weights.findIndex((x) => x.id === w.weightId);
        await page.getByRole("combobox").nth(index).selectOption(String(w.pos));
      }
    if (p.kind === "observatory")
      for (let i = 0; i < p.solution.length; i++) {
        const select = page.getByRole("combobox").nth(i);
        if (!(await select.isDisabled()))
          await select.selectOption(p.solution[i]);
      }
    await page.waitForTimeout(450);
    const before = await page
      .locator("select")
      .evaluateAll((nodes) => nodes.map((x) => x.value));
    await page.reload();
    await page.getByRole("button", { name: "ตรวจผังนี้" }).waitFor();
    assert.deepEqual(
      await page
        .locator("select")
        .evaluateAll((nodes) => nodes.map((x) => x.value)),
      before,
    );
    checks++;
    await page.getByRole("button", { name: "ตรวจผังนี้" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "ผ่านข้อมูลจำลอง" })
      .waitFor();
    checks++;
  }
  assert.deepEqual(errors, []);
  checks++;
  console.log(
    `Synthetic browser preview: ${checks} checks passed, four viewport sizes, four solved server-validated puzzles. Screenshots: test-results/farm-phase2. No production DB connection.`,
  );
} finally {
  await browser.close();
}
