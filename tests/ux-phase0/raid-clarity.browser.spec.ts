import { expect, test, type Page } from "@playwright/test";

async function startPreview(page: Page) {
  test.skip(process.env.QUIZMON_E2E_RAID_PREVIEW !== "1", "Requires a local dev server with RAID_CARD_PREVIEW=true");
  await page.goto("/raid/preview");
  await page.getByRole("button", { name: "เริ่มใหม่", exact: true }).click();
  await page.getByRole("button", { name: /^ตีแรง ลุ้นคริติคอล/ }).click();
  await expect(page.getByRole("region", { name: "คำถามเพื่อใช้การ์ด" })).toBeVisible();
}

test("Raid confirms an answer once and restores the explanation after reload", async ({ page }) => {
  await startPreview(page);
  const choices = page.getByTestId("answer-card");
  await choices.nth(1).click();
  await expect(choices.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "ผลคำตอบและเฉลย" })).toHaveCount(0);

  const confirm = page.getByRole("button", { name: "ยืนยันคำตอบ · ใช้ท่านี้" });
  expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await confirm.click();
  await expect(page.getByRole("heading", { name: "✓ ตอบถูกแล้ว!" })).toBeVisible();
  await expect(page.getByLabel("ผลของท่านี้")).toContainText("ลดเลือดบอส");
  await expect(page.getByTestId("answer-card")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "✓ ตอบถูกแล้ว!" })).toBeVisible();
  await page.getByRole("button", { name: "กลับไปเลือกท่าถัดไป →" }).click();
  await expect(page.getByRole("region", { name: "สนามต่อสู้" })).toBeVisible();
  await expect(page.getByText("บันทึกการต่อสู้ · 1 เทิร์น", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Raid wrong-answer feedback keeps both solutions and a visible next action at 125% text", async ({ page }) => {
  await startPreview(page);
  await page.getByTestId("answer-card").nth(0).click();
  await page.getByRole("button", { name: "ยืนยันคำตอบ · ใช้ท่านี้" }).click();
  const feedback = page.getByRole("region", { name: "ผลคำตอบและเฉลย" });
  await expect(feedback).toContainText("คำตอบของเรา:");
  await expect(feedback).toContainText("คำตอบที่ถูก:");
  await expect(feedback).toContainText("จำนวนทั้งหมด = จำนวนกล่อง × จำนวนต่อกล่อง");
  // Scale each computed size once; nested percentages would compound at every level.
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map(element => [element, parseFloat(getComputedStyle(element).fontSize)] as const);
    for (const [element, size] of sizes) element.style.setProperty("font-size", `${size * 1.25}px`, "important");
  });
  const next = page.getByRole("button", { name: "กลับไปเลือกท่าถัดไป →" });
  await expect(next).toBeVisible();
  const box = await next.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
