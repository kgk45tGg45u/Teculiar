/**
 * Browser authentication helpers. Two strategies:
 *   - injectAuthCookies: fast, deterministic — set the JWT cookies the web app
 *     reads, then navigate straight into the portal (no rate-limited UI login).
 *   - uiLogin: exercises the real login form (used by auth-flow coverage).
 */
import type { BrowserContext, Page } from "@playwright/test";
import { env } from "../config/env";

type Scope = "client" | "admin";

function cookieNames(scope: Scope): { access: string; refresh: string } {
  return scope === "admin"
    ? { access: env.cookies.adminAccess, refresh: env.cookies.adminRefresh }
    : { access: env.cookies.clientAccess, refresh: env.cookies.clientRefresh };
}

/** Inject JWT auth cookies into a browser context so portal pages load authenticated. */
export async function injectAuthCookies(
  context: BrowserContext,
  scope: Scope,
  tokens: { accessToken: string; refreshToken?: string }
): Promise<void> {
  const { access, refresh } = cookieNames(scope);
  const domain = new URL(env.baseURL).hostname;
  await context.addCookies([
    { name: access, value: tokens.accessToken, domain, path: "/" },
    { name: refresh, value: tokens.refreshToken ?? "", domain, path: "/" }
  ]);
}

/** Drive the real login form. Returns once the post-login URL is reached. */
export async function uiLogin(page: Page, scope: Scope, email: string, password: string): Promise<void> {
  await page.goto(scope === "admin" ? `${env.baseURL}/admin/login` : `${env.baseURL}/login`);
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  const explicit = page.getByRole("button", { name: /^(Login|Anmelden|Sign in)$/i });
  await ((await explicit.count()) > 0 ? explicit.first() : page.locator('button[type="submit"]').first()).click();
  const target = scope === "admin" ? /\/admin(?!\/login)/ : /\/client/;
  await page.waitForURL(target, { timeout: 20_000 });
}
