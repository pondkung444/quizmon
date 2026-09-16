import { expect, test, type Page } from "@playwright/test";

const testEmail = process.env.QUIZMON_E2E_EMAIL;
const testPassword = process.env.QUIZMON_E2E_PASSWORD;

async function expectUsablePage(page: Page) {
  await expect(page.locator("body")).not.toHaveText("");
  await expect(page.locator("[data-nextjs-dialog], .vite-error-overlay")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const primary = page.locator("button:visible, a:visible").first();
  await expect(primary).toBeVisible();
}

test("public entry and guest setup remain usable", async ({ page }) => {
  await page.goto("/login");
  await expectUsablePage(page);
  await page.getByText("เริ่มการผจญภัย", { exact: true }).click();
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.getByRole("heading", { name: "เริ่มเล่นได้เลย!" })).toBeVisible();
  await expectUsablePage(page);
  await page.getByLabel("ชื่อที่ใช้แสดง").fill(`UXP0${Date.now().toString().slice(-8)}`);
  await page.getByLabel("ระดับชั้น").selectOption("ม.3");
  const start = page.getByRole("button", { name: "เริ่มเลย" });
  const box = await start.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("Phase 1 new guest sees one responsive next action @phase1", async ({ page }) => {
  test.skip(
    process.env.QUIZMON_E2E_GUEST_RECOVERY !== "1",
    "Enable after the Phase 0 guest recovery migration is deployed to the test environment",
  );
  await page.goto("/guest");
  await page.getByLabel("ชื่อที่ใช้แสดง").fill(`UXP1${Date.now().toString().slice(-8)}`);
  await page.getByLabel("ระดับชั้น").selectOption("ม.3");
  await page.getByRole("button", { name: "เริ่มเลย" }).click();
  await page.waitForURL(/\/eggs$/);

  await page.goto("/pet");
  const hero = page.getByRole("region", { name: "ฟัก Qmon ตัวแรก" });
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("link", { name: "เลือกไข่" })).toHaveAttribute("href", "/eggs");
  const ctaBox = await hero.getByRole("link", { name: "เลือกไข่" }).boundingBox();
  expect(ctaBox?.height).toBeGreaterThanOrEqual(44);
  await hero.getByText("กิจกรรมอื่น", { exact: true }).click();
  await expect(hero.getByRole("navigation", { name: "กิจกรรมอื่น" })).toBeVisible();
  await expectUsablePage(page);
});

test("authenticated journey routes render without overflow", async ({ page }) => {
  test.skip(!testEmail || !testPassword, "Set disposable QUIZMON_E2E_EMAIL/PASSWORD to run authenticated journeys");
  await page.goto("/login");
  await page.getByRole("button", { name: /มีบัญชีอยู่แล้ว/ }).click().catch(() => {});
  await page.getByLabel("อีเมล").fill(testEmail!);
  await page.getByLabel("รหัสผ่าน").fill(testPassword!);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL(/\/(pet|eggs|login\/complete-profile)/);

  for (const route of ["/pet", "/quiz", "/adventure", "/raid", "/social", "/pvp", "/boss-raid"]) {
    await page.goto(route);
    await expectUsablePage(page);
  }
});
