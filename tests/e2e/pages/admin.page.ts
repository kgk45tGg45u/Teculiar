import { expect, type Page } from "@playwright/test";
import { BasePage } from "./base.page";

/** Admin pages used by the suite (cron runner, payment-gateway settings). */
export class AdminPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoCronSettings(): Promise<void> {
    await this.page.goto(`${this.baseURL}/admin/settings/cron`);
    await this.page.waitForLoadState("networkidle");
  }

  async runCronViaUi(): Promise<void> {
    const runBtn = this.page.getByRole("button", { name: /run cron now/i });
    await expect(runBtn).toBeVisible({ timeout: 10_000 });
    await runBtn.click();
    await expect(this.page.locator("text=/Cron finished\\..*Ran \\d+.*skipped \\d+/")).toBeVisible({ timeout: 120_000 });
  }

  async gotoPaymentGateways(): Promise<void> {
    await this.page.goto(`${this.baseURL}/admin/settings/payment-gateways`);
    await this.page.waitForLoadState("networkidle");
  }
}
