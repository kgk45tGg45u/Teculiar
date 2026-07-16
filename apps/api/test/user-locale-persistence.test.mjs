import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { UsersService } from "../dist/modules/users/users.service.js";

// A users repository mock that records what updateProfile received and echoes a public-ish user.
function repoMock(captured) {
  return {
    updateProfile: async (userId, input) => {
      captured.userId = userId;
      captured.input = input;
      return { email: "client@example.test", id: userId, locale: input.locale, name: "Ada" };
    }
  };
}

test("updateProfile persists a well-formed locale and exposes it on the public user", async () => {
  const captured = {};
  const service = new UsersService(repoMock(captured));

  const result = await service.updateProfile("u1", { locale: "en", name: "Ada" });

  assert.equal(captured.input.locale, "en");
  assert.equal(result.locale, "en");
});

test("updateProfile accepts region subtags like pt-BR", async () => {
  const captured = {};
  const service = new UsersService(repoMock(captured));

  await service.updateProfile("u1", { locale: "pt-BR" });

  assert.equal(captured.input.locale, "pt-BR");
});

test("updateProfile drops a malformed locale instead of storing it", async () => {
  const captured = {};
  const service = new UsersService(repoMock(captured));

  await service.updateProfile("u1", { locale: "../../etc/passwd" });

  assert.equal(captured.input.locale, undefined);
});

// Every transactional dispatch must carry the recipient's stored locale — a missing `locale:`
// silently falls back to the store's main language (the bug: an English-language customer got
// their password-reset and order-confirmation mail in German).
test("all user-facing email dispatches pass the recipient locale", async () => {
  const authService = await readFile(new URL("../src/modules/auth/auth.service.ts", import.meta.url), "utf8");
  const usersService = await readFile(new URL("../src/modules/users/users.service.ts", import.meta.url), "utf8");
  const ordersService = await readFile(new URL("../src/modules/orders/orders.service.ts", import.meta.url), "utf8");
  const usersRepository = await readFile(new URL("../src/modules/users/users.repository.ts", import.meta.url), "utf8");

  // password_reset + the client welcome dispatch in auth (admin bootstrap has no stored locale),
  // and the createClient welcome in users.
  const authDispatches = authService.match(/user: \{ email: user\.email, id: user\.id, locale: user\.locale/g) ?? [];
  assert.ok(authDispatches.length >= 2, "auth dispatches (client welcome, password_reset) pass locale");
  assert.match(usersService, /locale: client\.locale/);

  // The order confirmation resolves the locale from invoice.user, then order.user, then snapshot.
  assert.match(ordersService, /stringOrUndefined\(invoice\.user\?\.locale\)/);
  assert.match(ordersService, /order\.user as Record<string, unknown> \| undefined\)\?\.locale/);

  // The auth select actually loads the locale column (it used to be missing → always undefined).
  assert.match(usersRepository, /const authUserSelect = \{[\s\S]*?locale: true[\s\S]*?\};/);
});
