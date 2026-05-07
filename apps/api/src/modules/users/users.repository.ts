import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } }
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { contacts: { orderBy: { createdAt: "desc" }, take: 1 }, userRoles: { include: { role: true } } }
    });
  }

  createUser(input: {
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email: string;
    name: string;
    passwordHash: string;
    vatId?: string;
  }) {
    return this.prisma.user.create({
      data: {
        ...input,
        userRoles: {
          create: {
            role: {
              connectOrCreate: {
                where: { slug: "client" },
                create: { slug: "client", name: "Client" }
              }
            }
          }
        }
      }
    });
  }

  async adminExists() {
    const count = await this.prisma.user.count({
      where: { userRoles: { some: { role: { slug: "admin" } } } }
    });
    return count > 0;
  }

  createUserWithRole(
    input: {
      countryCode?: string;
      customerType?: "INDIVIDUAL" | "BUSINESS";
      email: string;
      name: string;
      passwordHash: string;
      vatId?: string;
    },
    roleSlug: string
  ) {
    return this.prisma.user.create({
      data: {
        ...input,
        userRoles: {
          create: {
            role: {
              connectOrCreate: {
                where: { slug: roleSlug },
                create: { slug: roleSlug, name: roleSlug === "admin" ? "Admin" : roleSlug }
              }
            }
          }
        }
      }
    });
  }

  listClients() {
    return this.prisma.user.findMany({
      where: { userRoles: { some: { role: { slug: "client" } } } },
      include: { teams: true, contacts: true },
      orderBy: { createdAt: "desc" }
    });
  }

  updateSegment(userId: string, segment: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { segment } });
  }

  async updateProfile(userId: string, input: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
    name?: string;
    phone?: string;
    vatId?: string;
  }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        countryCode: input.countryCode,
        customerType: input.customerType,
        email: input.email,
        name: input.name,
        vatId: input.vatId
      }
    });

    if (input.phone !== undefined || input.address !== undefined) {
      await this.prisma.contact.upsert({
        where: { id: (await this.prisma.contact.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }))?.id ?? "" },
        create: {
          address: input.address as Prisma.InputJsonValue,
          email: input.email ?? user.email,
          name: input.name ?? user.name,
          phone: input.phone,
          type: "BILLING",
          userId
        },
        update: {
          address: input.address as Prisma.InputJsonValue,
          email: input.email ?? user.email,
          name: input.name ?? user.name,
          phone: input.phone
        }
      });
    }

    return this.findById(userId);
  }

  setTotpSecret(userId: string, secret: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
  }

  enableTotp(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true } });
  }

  createRefreshSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.refreshSession.create({ data: input });
  }

  findRefreshSessionByTokenHash(tokenHash: string) {
    return this.prisma.refreshSession.findFirst({
      where: { tokenHash },
      include: { user: { include: { userRoles: { include: { role: true } } } } }
    });
  }

  revokeRefreshSession(id: string) {
    return this.prisma.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  revokeRefreshSessionByHash(tokenHash: string) {
    return this.prisma.refreshSession.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }
}
