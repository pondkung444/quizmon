import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch();
let checks = 0;
try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport });
    let state = {
      help: 0,
      place: 0,
      unread: 0,
      nextAt: null,
      serverNow: "2026-10-12T00:00:00Z",
    };
    await page.route("**/api/farm/attention", (route) =>
      route.fulfill({ json: state }),
    );
    await page.goto((process.env.FARM_TEST_URL ?? "http://localhost:3107")+"/collection/preview?kind=attention");
    await page.getByRole("link", { name: "ไปฟักไข่ →" }).waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "ไปบทสอนโรงเรียน →" })
        .getAttribute("href"),
      "/collection/school",
    );
    checks++;
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    assert.equal(await page.getByRole("status").count(), 0);
    checks++;
    state = { ...state, help: 1 };
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await page.getByRole("status").first().waitFor();
    checks++;
    state = { ...state, help: 0 };
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await page.getByRole("status").first().waitFor({ state: "detached" });
    checks++;
    state = { ...state, nextAt: "2026-10-12T00:00:01Z" };
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await page.getByRole("status").first().waitFor();
    checks++;
    await page.close();
  }
  console.log(
    "Attention browser: " +
      checks +
      " mock checks passed; no authenticated DB or push",
  );
} finally {
  await browser.close();
}
