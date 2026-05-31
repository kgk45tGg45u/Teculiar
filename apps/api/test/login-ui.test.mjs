import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin login logo uses public storefront settings", async () => {
  const layout = await readFile(new URL("../../web/app/admin/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /apiGet<\{ siteLogoUrl\?: string \}>\("\/storefront\/settings"\)/);
  assert.doesNotMatch(layout, /apiGetAuth<\{ siteLogoUrl\?: string \}>/);
});

test("login form has localized copy and stable input font styling", async () => {
  const form = await readFile(new URL("../../web/components/auth/login-form.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../web/components/auth/login-form.module.css", import.meta.url), "utf8");

  assert.match(form, /adminTitle: "Admin-Anmeldung"/);
  assert.match(form, /adminTitle: "Admin Login"/);
  assert.match(form, /loginButton: "Anmelden"/);
  assert.match(form, /loginButton: "Login"/);
  assert.match(styles, /font-weight: 600/);
  assert.match(styles, /:-webkit-autofill/);
});
