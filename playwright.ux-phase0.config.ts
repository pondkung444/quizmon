import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.QUIZMON_E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "tests/ux-phase0",
  testMatch: "*.browser.spec.ts",
  timeout: 45_000,
  retries: 1,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true } },
    { name: "mobile-393", use: { ...devices["Desktop Chrome"], viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true } },
    { name: "mobile-412", use: { ...devices["Desktop Chrome"], viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
  ],
  reporter: [["list"], ["html", { outputFolder: "output/ux-phase0-playwright", open: "never" }]],
});
