/**
 * Failure diagnostics. On provisioning timeouts (Category 4/5) we attach the last
 * observed API state, logs, and any captured responses to the Playwright report so
 * failures are debuggable without a re-run. Traces/screenshots/video are handled by
 * the config (retain-on-failure).
 */
import type { TestInfo } from "@playwright/test";

export async function attachJson(testInfo: TestInfo, name: string, data: unknown): Promise<void> {
  await testInfo.attach(name, { body: JSON.stringify(data, null, 2), contentType: "application/json" });
}

export async function attachText(testInfo: TestInfo, name: string, text: string): Promise<void> {
  await testInfo.attach(name, { body: text, contentType: "text/plain" });
}
