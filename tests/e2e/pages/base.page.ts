import { expect, type Page } from "@playwright/test";
import { env } from "../config/env";

/** Shared base for all page objects: holds the page + base URL and common asserts. */
export class BasePage {
  constructor(protected readonly page: Page, protected readonly baseURL: string = env.baseURL) {}

  async expectNoServerError(): Promise<void> {
    await expect(this.page.locator("body")).not.toContainText("Internal Server Error");
    await expect(this.page.locator("body")).not.toContainText("Application error");
  }

  url(): string {
    return this.page.url();
  }
}
