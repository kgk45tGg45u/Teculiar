import { defineConfig, devices } from "@playwright/test";

const baseURL = (process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const apiURL = (process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(/\/$/, "");
const serverMode = process.env.PLAYWRIGHT_START_SERVERS ?? "";
const webReadyURL = `${baseURL}/de`;
const apiReadyURL = `${apiURL}/products`;

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: "./tests/e2e/artifacts/test-output",
  timeout: 60_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "tests/e2e/results/html" }],
    ["json", { outputFile: "tests/e2e/results/results.json" }],
    ["./tests/e2e/reporters/markdown-reporter.cjs", { outputFile: "tests/e2e/results/latest-report.md" }]
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: webServers()
});

function webServers() {
  const web = {
    command: "npm run dev:web",
    env: {
      ...process.env,
      HOST: process.env.HOST ?? "127.0.0.1",
      NEXT_PUBLIC_API_URL: apiURL
    },
    reuseExistingServer: true,
    timeout: 120_000,
    url: webReadyURL
  };
  const api = {
    command: "npm run dev:api",
    env: {
      ...process.env,
      HOST: process.env.HOST ?? "127.0.0.1"
    },
    reuseExistingServer: true,
    timeout: 120_000,
    url: apiReadyURL
  };

  if (serverMode === "web") {
    return web;
  }
  if (serverMode === "1" || serverMode === "full") {
    return [api, web];
  }
  return undefined;
}
