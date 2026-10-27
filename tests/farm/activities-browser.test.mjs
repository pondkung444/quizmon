import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch();
let checks = 0;
try {
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(120000);
  p.on("pageerror", (e) => console.log("Page error:", e.message));
  await p.goto((process.env.FARM_TEST_URL ?? "http://localhost:3107")+"/collection/preview?kind=activities");
  await p
    .locator('[data-farm-camera-ready="true"]')
    .waitFor({ timeout: 60000 });
  const residents = p.locator("[data-farm-resident]");
  assert.equal(await residents.count(), 3);
  checks++;
  let seen = false;
  for (let i = 0; i < 90 && !seen; i++) {
    await p.waitForTimeout(100);
    await p.evaluate(() => {
      for (const a of document.getAnimations())
        if (
          a.effect?.target?.hasAttribute("data-farm-resident") &&
          a.playState === "running"
        )
          a.finish();
    });
    seen = await residents.evaluateAll((nodes) =>
      nodes.some((n) => !!n.dataset.activity),
    );
  }
  assert.equal(seen, true);
  checks++;
  await p.getByRole("button", { name: "พักการเดิน", exact: true }).click();
  await p.getByRole("button", { name: "เดินเล่นต่อ", exact: true }).waitFor();
  await p.waitForTimeout(100);
  await p.waitForFunction(() =>
    [...document.querySelectorAll("[data-farm-resident]")].every(
      (n) => n.dataset.paused === "true",
    ),
  );
  const positions = await residents.evaluateAll((nodes) =>
    nodes.map((n) => n.style.transform),
  );
  await p.waitForTimeout(1000);
  assert.deepEqual(
    await residents.evaluateAll((nodes) => nodes.map((n) => n.style.transform)),
    positions,
  );
  checks++;
  assert.equal(
    await residents.evaluateAll((nodes) =>
      nodes.every((n) => n.dataset.paused === "true"),
    ),
    true,
  );
  checks++;
  await p.getByRole("button", { name: "เดินเล่นต่อ", exact: true }).click();
  await p.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await residents.evaluateAll((nodes) =>
    nodes.map((n) => n.style.transform),
  );
  await p.waitForTimeout(1000);
  assert.deepEqual(
    await residents.evaluateAll((nodes) => nodes.map((n) => n.style.transform)),
    reduced,
  );
  checks++;
  assert.equal(
    await residents.evaluateAll((nodes) =>
      nodes.every((n) => n.dataset.paused === "true"),
    ),
    true,
  );
  checks++;
  await p.screenshot({
    path: "test-results/farm-phase7/activities.png",
    fullPage: true,
  });
  console.log(
    `Resident activities browser: ${checks} checks passed; animation completion for accelerated traversal, no database`,
  );
} finally {
  await b.close();
}
