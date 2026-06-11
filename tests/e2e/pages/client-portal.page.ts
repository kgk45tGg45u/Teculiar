import { expect, type Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Client portal pages (/client, /client/services, /client/domains, /client/invoices,
 * /client/billing/add-funds). The portal renders server/domain/invoice tables fed
 * by /services and /billing/invoices.
 */
export class ClientPortalPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoDashboard(): Promise<void> {
    await this.page.goto(`${this.baseURL}/client`);
    await this.page.waitForLoadState("networkidle");
  }

  async gotoServices(): Promise<void> {
    await this.page.goto(`${this.baseURL}/client/services`);
    await this.page.waitForLoadState("networkidle");
  }

  async gotoDomains(): Promise<void> {
    await this.page.goto(`${this.baseURL}/client/domains`);
    await this.page.waitForLoadState("networkidle");
  }

  async gotoInvoices(): Promise<void> {
    await this.page.goto(`${this.baseURL}/client/invoices`);
    await this.page.waitForLoadState("networkidle");
  }

  async gotoAddFunds(): Promise<void> {
    await this.page.goto(`${this.baseURL}/client/billing/add-funds`);
    await this.page.waitForLoadState("networkidle");
  }

  /** Assert text appears anywhere in the main content (e.g. a domain or invoice number). */
  async expectVisibleText(pattern: string | RegExp): Promise<void> {
    await expect(this.page.locator("body")).toContainText(pattern, { timeout: 15_000 });
  }

  async hasText(pattern: string | RegExp): Promise<boolean> {
    const body = (await this.page.locator("body").textContent()) ?? "";
    return typeof pattern === "string" ? body.includes(pattern) : pattern.test(body);
  }
}
