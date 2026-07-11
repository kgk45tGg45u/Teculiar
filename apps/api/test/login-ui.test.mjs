import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("admin login logo uses public storefront settings", async () => {
  const layout = await readFile(new URL("../../web/app/admin/layout.tsx", import.meta.url), "utf8");

  // SSR layout reads the PUBLIC settings endpoint (no auth) via the server-side helper.
  assert.match(layout, /serverApiGet<\{ siteLogoUrl\?: string/);
  assert.match(layout, /"\/storefront\/settings"/);
  assert.doesNotMatch(layout, /apiGetAuth</);
});

test("login form has localized copy and stable input font styling", async () => {
  const form = await readFile(new URL("../../web/components/auth/login-form.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../web/components/auth/login-form.module.css", import.meta.url), "utf8");
  const de = JSON.parse(await readFile(new URL("../../../packages/locales/de/storefront.json", import.meta.url), "utf8"));
  const en = JSON.parse(await readFile(new URL("../../../packages/locales/en/storefront.json", import.meta.url), "utf8"));

  // Copy moved from inline literals to the shared storefront locale packs.
  assert.match(form, /getDictionary\(locale\)\.storefront\.login/);
  assert.equal(de.login.adminTitle, "Admin-Anmeldung");
  assert.equal(en.login.adminTitle, "Admin Login");
  assert.equal(de.login.loginButton, "Anmelden");
  assert.equal(en.login.loginButton, "Sign in");
  assert.match(styles, /font-weight: 600/);
  assert.match(styles, /:-webkit-autofill/);
});
