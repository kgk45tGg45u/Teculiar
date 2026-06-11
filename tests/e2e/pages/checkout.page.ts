import { expect, type Page } from "@playwright/test";
import { BasePage } from "./base.page";
import type { Customer } from "../factories/customer.factory";
import { CustomerFactory } from "../factories/customer.factory";

/**
 * Storefront checkout page (/{locale}/order/{productId}). Field names and the
 * payment-method radio values mirror apps/web/components/checkout/checkout-form.tsx.
 */
export class CheckoutPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(productId: string, locale = "de"): Promise<void> {
    await this.page.goto(`${this.baseURL}/${locale}/order/${productId}`);
    await this.page.waitForLoadState("networkidle");
  }

  async fillHostingDomain(domain: string): Promise<void> {
    const input = this.page.locator('input[name="hostingDomainName"], input[name="domainName"]');
    if ((await input.count()) > 0) await input.first().fill(domain);
  }

  async fillDomainName(domain: string): Promise<void> {
    const input = this.page.locator('input[name="domainName"]');
    if ((await input.count()) > 0) {
      await input.first().fill(domain);
      await input.first().press("Tab"); // triggers availability check (onBlur)
    }
  }

  async fillCustomer(customer: Customer): Promise<void> {
    for (const [name, value] of Object.entries(CustomerFactory.toFormFields(customer))) {
      const field = this.page.locator(`[name="${name}"]`);
      if ((await field.count()) > 0) await field.first().fill(value);
    }
  }

  /** Available payment-method radio values currently rendered. */
  async paymentMethods(): Promise<string[]> {
    const radios = this.page.locator('input[type="radio"][name="paymentMethod"], input[type="radio"][value]');
    const values: string[] = [];
    for (let i = 0; i < (await radios.count()); i++) {
      const value = await radios.nth(i).getAttribute("value");
      if (value && /^[A-Z_]+$/.test(value)) values.push(value);
    }
    return [...new Set(values)];
  }

  async selectPaymentMethod(method: string): Promise<boolean> {
    const label = this.page.locator(`label:has(input[type="radio"][value="${method}"])`);
    if ((await label.count()) > 0) {
      await label.first().click();
      return true;
    }
    const radio = this.page.locator(`input[type="radio"][value="${method}"]`);
    if ((await radio.count()) > 0) {
      await radio.first().click();
      return true;
    }
    return false;
  }

  async acceptTerms(): Promise<void> {
    const terms = this.page.locator('[name="acceptedTerms"]');
    if ((await terms.count()) > 0) await terms.first().check();
  }

  async submit(): Promise<void> {
    await this.page.locator('button[type="submit"]').first().click();
  }

  async expectRedirectToPortal(): Promise<void> {
    await this.page.waitForURL(/\/client/, { timeout: 45_000 });
    await expect(this.page).toHaveURL(/\/client/);
    await this.expectNoServerError();
  }

  async expectFormVisible(): Promise<void> {
    await expect(this.page.locator("form").first()).toBeVisible({ timeout: 10_000 });
  }
}
