import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const b = await chromium.launch();
let checks = 0;
try {
  const p = await b.newPage();
  p.setDefaultNavigationTimeout(120000);
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await p.setViewportSize(size);
    await p.goto("http://localhost:3107/collection/preview?kind=history");
    await p
      .getByRole("heading", { name: "โรงเรียน ระดับ 4", exact: true })
      .waitFor();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    checks++;
    for (const name of ["หัวหน้าคนแรก", "คู่หูผู้ช่วย", "Qmon ที่เคยร่วมงาน"]) {
      await p.getByText(name, { exact: false }).waitFor();
      checks++;
    }
    const replay = p.getByRole("link", {
      name: "เล่นทบทวน · ไม่จับเวลา ไม่รับเหรียญหรือ EXP",
      exact: true,
    });
    assert.equal(
      await replay.getAttribute("href"),
      "/collection/practice/construction-floor",
    );
    checks++;
    await p.screenshot({
      path: `test-results/farm-phase7/history-${size.width}.png`,
      fullPage: true,
    });
  }
  console.log(
    `History browser: ${checks} checks passed; synthetic metadata only`,
  );
} finally {
  await b.close();
}
