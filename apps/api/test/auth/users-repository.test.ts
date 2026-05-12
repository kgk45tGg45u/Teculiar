import { strict as assert } from "node:assert";
import test from "node:test";
import { UsersRepository } from "../../src/modules/users/users.repository";

test("auth lookup selects only login fields", async () => {
  let query: unknown;
  const prisma = {
    user: {
      findUnique: async (args: unknown) => {
        query = args;
        return null;
      }
    }
  };
  const repository = new UsersRepository(prisma as never);

  await repository.findByEmail("client@example.com");

  assert.deepEqual(query, {
    where: { email: "client@example.com" },
    select: {
      email: true,
      id: true,
      passwordHash: true,
      totpEnabled: true,
      totpSecret: true,
      userRoles: { select: { role: { select: { slug: true } } } }
    }
  });
});

test("profile lookup includes account balance for the dashboard", async () => {
  let query: unknown;
  const prisma = {
    user: {
      findUnique: async (args: unknown) => {
        query = args;
        return null;
      }
    }
  };
  const repository = new UsersRepository(prisma as never);

  await repository.findById("user_1");

  assert.deepEqual(query, {
    where: { id: "user_1" },
    select: {
      contacts: { orderBy: { createdAt: "desc" }, take: 1, select: { address: true, phone: true } },
      balanceCents: true,
      countryCode: true,
      customerType: true,
      email: true,
      id: true,
      name: true,
      totpSecret: true,
      userRoles: { select: { role: { select: { slug: true } } } },
      vatId: true
    }
  });
});
