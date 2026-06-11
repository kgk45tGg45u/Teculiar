/**
 * Playwright config for the comprehensive customer-lifecycle E2E suite.
 *
 * Runs against the live site (default https://www.dezhost.com). Separate from the
 * root playwright.config.ts so the lifecycle suite can run fully parallel with its
 * own global setup/teardown (sandbox toggle + Virtualmin cleanup) without affecting
 * the legacy specs.
 *
 *   E2E_BASE_URL=https://www.dezhost.com \
 *   E2E_API_URL=https://www.dezhost.com/api/v1 \
 *   npx playwright test --config=playwright.lifecycle.config.ts --project=chromium
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "https://www.dezhost.com").replace(/\/$/, "");

export default defineConfig({
  testDir: "./tests/e2e/specs/lifecycle",
  outputDir: "./tests/e2e/results/lifecycle-artifacts",

  // Provisioning waits can take up to 4 min; give each test generous headroom.
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },

  // Parallel where safe. Balance-mutating specs opt into serial mode themselves
  // via test.describe.configure({ mode: "serial" }).
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? (process.env.CI ? 3 : 4)),

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tests/e2e/results/lifecycle-html" }],
    ["json", { outputFile: "tests/e2e/results/lifecycle-results.json" }],
    ["./tests/e2e/reporters/markdown-reporter.cjs", { outputFile: "tests/e2e/results/lifecycle-report.md" }]
  ],

  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
