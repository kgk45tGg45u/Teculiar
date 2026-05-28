import { expect, test, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

type ScenarioFile = {
  version: number;
  scenarios: Scenario[];
};

type Scenario = {
  id: string;
  title: string;
  tags?: string[];
  requiresEnv?: string[];
  steps: Step[];
};

type Step = {
  check?: LocatorInput;
  click?: string | ClickInput;
  expectHeading?: TextInput;
  expectText?: TextInput;
  expectUrl?: string;
  fill?: LocatorInput & { value: string };
  goto?: string;
  login?: LoginInput;
  note?: string;
  optional?: boolean;
  select?: LocatorInput & { value: string };
  timeout?: number;
};

type LocatorInput = {
  css?: string;
  label?: string;
  name?: string;
  placeholder?: string;
};

type ClickInput = {
  css?: string;
  name?: string;
  role?: "button" | "link" | "tab" | "menuitem";
  text?: string;
};

type LoginInput = {
  emailEnv: string;
  passwordEnv: string;
  scope: "admin" | "client";
};

type TextInput = string | { exact?: boolean; regex?: string; text?: string };

type StepTiming = {
  durationMs: number;
  error?: string;
  index: number;
  label: string;
  status: "passed" | "failed" | "skipped";
};

const scenarioFile = loadScenarioFile();
const requestedTags = (process.env.E2E_TAGS ?? "")
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);

test.describe("README scenarios", () => {
  for (const scenario of scenarioFile.scenarios) {
    const missingEnv = (scenario.requiresEnv ?? []).filter((key) => !process.env[key]);
    const tagFiltered = requestedTags.length > 0 && !(scenario.tags ?? []).some((tag) => requestedTags.includes(tag));
    const skipReason = missingEnv.length > 0
      ? `Missing env: ${missingEnv.join(", ")}`
      : tagFiltered
        ? `Filtered by E2E_TAGS=${requestedTags.join(",")}`
        : "";
    const scenarioTest = skipReason ? test.skip : test;

    scenarioTest(`${scenario.id}: ${scenario.title}`, async ({ page }, testInfo) => {

      const timings: StepTiming[] = [];
      const browserErrors: string[] = [];

      page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") {
          browserErrors.push(`console.error: ${message.text()}`);
        }
      });

      try {
        for (const [index, step] of scenario.steps.entries()) {
          const label = stepLabel(index, step);
          const startedAt = Date.now();
          try {
            await test.step(label, async () => runStep(page, step, testInfo));
            timings.push({ durationMs: Date.now() - startedAt, index: index + 1, label, status: "passed" });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            timings.push({ durationMs: Date.now() - startedAt, error: message, index: index + 1, label, status: "failed" });
            if (!step.optional) {
              throw error;
            }
          }
        }

        await page.waitForTimeout(300);
        expect(browserErrors, "browser console/page errors").toEqual([]);
      } finally {
        const timingPath = testInfo.outputPath("step-timings.json");
        fs.mkdirSync(path.dirname(timingPath), { recursive: true });
        fs.writeFileSync(timingPath, JSON.stringify(timings, null, 2), "utf8");
        await testInfo.attach("step-timings", {
          contentType: "application/json",
          path: timingPath
        });
        if (browserErrors.length > 0) {
          await testInfo.attach("browser-errors", {
            body: browserErrors.join("\n"),
            contentType: "text/plain"
          });
        }
      }
    });
  }
});

async function runStep(page: Page, step: Step, testInfo: TestInfo) {
  if (step.goto) {
    await page.goto(step.goto, { waitUntil: "domcontentloaded" });
    return;
  }

  if (step.login) {
    await login(page, step.login);
    return;
  }

  if (step.expectHeading) {
    await expect(page.getByRole("heading", { name: textMatcher(step.expectHeading) }).first()).toBeVisible({ timeout: step.timeout });
    return;
  }

  if (step.expectText) {
    await expect(page.getByText(textMatcher(step.expectText), { exact: textExact(step.expectText) }).first()).toBeVisible({ timeout: step.timeout });
    return;
  }

  if (step.expectUrl) {
    await expect(page).toHaveURL(urlMatcher(step.expectUrl), { timeout: step.timeout });
    return;
  }

  if (step.select) {
    await field(page, step.select).selectOption(step.select.value, { timeout: step.timeout });
    return;
  }

  if (step.fill) {
    await field(page, step.fill).fill(step.fill.value, { timeout: step.timeout });
    return;
  }

  if (step.check) {
    await field(page, step.check).check({ timeout: step.timeout });
    return;
  }

  if (step.click) {
    await clickable(page, step.click).click({ timeout: step.timeout });
    return;
  }

  await testInfo.attach("unknown-step", {
    body: JSON.stringify(step, null, 2),
    contentType: "application/json"
  });
  throw new Error(`Unknown step: ${JSON.stringify(step)}`);
}

async function login(page: Page, input: LoginInput) {
  const email = process.env[input.emailEnv];
  const password = process.env[input.passwordEnv];
  if (!email || !password) {
    throw new Error(`Missing login env: ${input.emailEnv}, ${input.passwordEnv}`);
  }

  await page.goto(input.scope === "admin" ? "/admin/login" : "/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-Mail").first().fill(email);
  await page.getByLabel("Passwort").first().fill(password);
  await page.getByRole("button", { name: "Login" }).click();
}

function field(page: Page, input: LocatorInput) {
  if (input.css) {
    return page.locator(input.css).first();
  }
  if (input.label) {
    return page.getByLabel(input.label).first();
  }
  if (input.placeholder) {
    return page.getByPlaceholder(input.placeholder).first();
  }
  if (input.name) {
    return page.locator(`[name="${cssEscape(input.name)}"]`).first();
  }
  throw new Error(`Missing locator in ${JSON.stringify(input)}`);
}

function clickable(page: Page, input: string | ClickInput) {
  if (typeof input === "string") {
    return page.getByText(input).first();
  }
  if (input.css) {
    return page.locator(input.css).first();
  }
  if (input.role && input.name) {
    return page.getByRole(input.role, { name: input.name }).first();
  }
  if (input.text) {
    return page.getByText(input.text).first();
  }
  throw new Error(`Missing click locator in ${JSON.stringify(input)}`);
}

function textMatcher(input: TextInput) {
  if (typeof input === "string") {
    return input;
  }
  if (input.regex) {
    return new RegExp(input.regex, "i");
  }
  return input.text ?? "";
}

function textExact(input: TextInput) {
  return typeof input === "object" ? input.exact : undefined;
}

function urlMatcher(input: string) {
  if (/^https?:\/\//.test(input)) {
    return new RegExp(escapeRegex(input));
  }
  return new RegExp(`${escapeRegex(input)}(?:[/?#].*)?$`);
}

function stepLabel(index: number, step: Step) {
  const key = Object.keys(step).find((item) => !["note", "optional", "timeout"].includes(item)) ?? "step";
  return `${index + 1}. ${key}${step.note ? ` - ${step.note}` : ""}`;
}

function loadScenarioFile(): ScenarioFile {
  const scenarioReadme = process.env.E2E_SCENARIO_FILE
    ? path.resolve(process.cwd(), process.env.E2E_SCENARIO_FILE)
    : path.resolve(process.cwd(), "tests/e2e/README.md");
  const content = fs.readFileSync(scenarioReadme, "utf8");
  const match = content.match(/```json\s+playwright-scenarios\s*\n([\s\S]*?)```/);
  if (!match) {
    throw new Error(`No json playwright-scenarios block found in ${scenarioReadme}`);
  }
  return JSON.parse(match[1]) as ScenarioFile;
}

function cssEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
