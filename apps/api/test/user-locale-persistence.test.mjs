import assert from "node:assert/strict";
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
