import { type Page } from "@playwright/test";
import { BasePage } from "./base.page";

/** Login form (client at /login, admin at /admin/login). */
export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(scope: "client" | "admin" = "client"): Promise<void> {
    await this.page.goto(scope === "admin" ? `${this.baseURL}/admin/login` : `${this.baseURL}/login`);
  }

  async submit(email: string, password: string, scope: "client" | "admin" = "client"): Promise<void> {
    await this.page.fill('[name="email"]', email);
    await this.page.fill('[name="password"]', password);
    const explicit = this.page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
    await ((await explicit.count()) > 0 ? explicit.first() : this.page.locator('button[type="submit"]').first()).click();
    await this.page.waitForURL(scope === "admin" ? /\/admin(?!\/login)/ : /\/client/, { timeout: 20_000 });
  }
}
