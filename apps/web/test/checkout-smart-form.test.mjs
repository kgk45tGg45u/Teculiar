import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkout = readFileSync(new URL("../../storefront/components/checkout/checkout-form.tsx", import.meta.url), "utf8");
const checkoutCss = readFileSync(new URL("../../storefront/components/checkout/checkout-form.module.css", import.meta.url), "utf8");
const adminForms = readFileSync(new URL("../components/admin/admin-forms.tsx", import.meta.url), "utf8");
const apiController = readFileSync(new URL("../../api/src/modules/billing/billing.controller.ts", import.meta.url), "utf8");
const apiService = readFileSync(new URL("../../api/src/modules/billing/billing.service.ts", import.meta.url), "utf8");
const localizationDoc = readFileSync(new URL("../../../docs/localization.md", import.meta.url), "utf8");

test("checkout has translated copy and admin-managed terms acceptance", () => {
  assert.match(checkout, /buildCheckoutCopy/);
  assert.match(checkout, /termsUrl/);
  assert.match(checkout, /name="acceptedTerms"/);
  assert.match(checkout, /copy\.termsLink/);
  // Falls back to the locale-prefixed AGB page when no admin termsUrl is configured.
  assert.match(checkout, /termsUrl \|\| `\/\$\{locale\}\/legal\/agb`/);
  assert.match(apiController, /termsUrl\?: string/);
  assert.match(apiService, /settingString\("termsUrl"/);
  assert.match(apiService, /upsertSettingString\("termsUrl"/);
  assert.match(adminForms, /termsUrl/);
});

test("logged in checkout asks only for missing profile fields", () => {
  assert.match(checkout, /missingProfileFields/);
  assert.match(checkout, /ProfileCompletionFields/);
  assert.match(checkout, /confirmProfileCompletion/);
  assert.match(checkout, /profileCheckoutCustomer\(profile, formData\)/);
  assert.doesNotMatch(checkout, /profile \? profileCheckoutCustomer\(profile\)/);
});

test("checkout form autocomplete and phone semantics prevent wrong browser autofill", () => {
  assert.match(checkout, /autoComplete="email"/);
  assert.match(checkout, /autoComplete="new-password"/);
  assert.match(checkout, /autoComplete="current-password"/);
  assert.match(checkout, /autoComplete="tel-country-code"/);
  assert.match(checkout, /autoComplete="tel-national"/);
  assert.match(checkout, /type="tel"/);
  assert.match(checkout, /autoComplete="street-address"/);
  assert.match(checkout, /autoComplete="postal-code"/);
});

test("checkout desktop domain and password action buttons are compact and equal", () => {
  assert.match(checkout, /domainCheckRow/);
  assert.match(checkout, /domainActionButton/);
  assert.match(checkoutCss, /\.domainActionButton,\s*\n\.generateButton/);
  assert.match(checkoutCss, /min-height: 36px/);
  assert.match(checkoutCss, /min-width: 132px/);
  assert.match(checkoutCss, /\.fieldLabel[\s\S]*font-weight: 560/);
  assert.match(checkoutCss, /\.input::placeholder[\s\S]*font-weight: 400/);
});

test("locale documentation states the saved preference is used before the browser language everywhere", () => {
  assert.match(localizationDoc, /browser language/i);
  assert.match(localizationDoc, /saved preference first/i);
  // Cookie renamed dezhost_locale -> teculiar_locale in the Phase 9.1 rebrand.
  assert.match(localizationDoc, /teculiar_locale/);
  // Checkout is now an explicit locale surface alongside public/client/admin.
  assert.match(localizationDoc, /public, client, admin, and checkout/i);
});
