import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: authUserSelect
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect
    });
  }

  createAuditLog(input: { action: string; actorId?: string; metadata?: Record<string, unknown>; subject: string; subjectId?: string }) {
    return this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        subject: input.subject,
        subjectId: input.subjectId
      }
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
      },
      select: { email: true, id: true }
    });
  }

  findOrCreatePendingCheckoutUser() {
    return this.prisma.user.upsert({
      where: { email: pendingCheckoutEmail },
      create: {
        countryCode: "DE",
        customerType: "BUSINESS",
        email: pendingCheckoutEmail,
        name: "Pending storefront checkout",
        passwordHash: "pending-checkout-system-user"
      },
      update: {},
      select: { email: true, id: true }
    });
  }

  async createClient(input: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email: string;
    name: string;
    passwordHash: string;
    phone?: string;
    vatId?: string;
  }) {
    return this.prisma.user.create({
      data: {
        countryCode: input.countryCode ?? "DE",
        customerType: input.customerType ?? "INDIVIDUAL",
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash: input.passwordHash,
        vatId: input.vatId,
        contacts: input.phone || input.address
          ? {
              create: {
                address: input.address as Prisma.InputJsonValue,
                email: input.email.toLowerCase(),
                name: input.name,
                phone: input.phone,
                type: "BILLING"
              }
            }
          : undefined,
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
      },
      select: clientSelect
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
      },
      select: { email: true, id: true }
    });
  }

  listClients() {
    return this.prisma.user.findMany({
      where: { userRoles: { some: { role: { slug: "client" } } } },
      select: clientSelect,
      orderBy: { createdAt: "desc" }
    });
  }

  findClient(id: string) {
    return this.prisma.user.findFirst({
      where: { id, userRoles: { some: { role: { slug: "client" } } } },
      select: clientSelect
    });
  }

  updateSegment(userId: string, segment: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { segment }, select: { id: true, segment: true } });
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
      },
      select: { email: true, name: true }
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

  async updateClient(userId: string, input: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
    name?: string;
    phone?: string;
    segment?: string;
    vatId?: string;
  }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        countryCode: input.countryCode,
        customerType: input.customerType,
        email: input.email?.toLowerCase(),
        name: input.name,
        segment: input.segment,
        vatId: input.vatId
      },
      select: { email: true, name: true }
    });

    if (input.phone !== undefined || input.address !== undefined || input.name !== undefined || input.email !== undefined) {
      const latest = await this.prisma.contact.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
      if (latest) {
        await this.prisma.contact.update({
          where: { id: latest.id },
          data: {
            address: input.address as Prisma.InputJsonValue,
            email: input.email?.toLowerCase() ?? user.email,
            name: input.name ?? user.name,
            phone: input.phone
          }
        });
      } else {
        await this.prisma.contact.create({
          data: {
            address: input.address as Prisma.InputJsonValue,
            email: input.email?.toLowerCase() ?? user.email,
            name: input.name ?? user.name,
            phone: input.phone,
            type: "BILLING",
            userId
          }
        });
      }
    }

    return this.findClient(userId);
  }

  async deleteClient(userId: string) {
    await this.prisma.userRole.deleteMany({ where: { userId, role: { slug: "client" } } });
    return this.prisma.user.delete({ where: { id: userId }, select: { id: true } });
  }

  setTotpSecret(userId: string, secret: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret }, select: { id: true } });
  }

  enableTotp(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true }, select: { id: true } });
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
      include: { user: { select: { email: true, userRoles: { select: { role: { select: { slug: true } } } } } } }
    });
  }

  revokeRefreshSession(id: string) {
    return this.prisma.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  revokeRefreshSessionByHash(tokenHash: string) {
    return this.prisma.refreshSession.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }

  updatePasswordHash(userId: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { passwordHash }, select: { id: true } });
  }
}

const authUserSelect = {
  email: true,
  id: true,
  name: true,
  passwordHash: true,
  totpEnabled: true,
  totpSecret: true,
  userRoles: { select: { role: { select: { slug: true } } } }
};

const publicUserSelect = {
  balanceCents: true,
  contacts: { orderBy: { createdAt: "desc" as const }, take: 1, select: { address: true, phone: true } },
  countryCode: true,
  customerType: true,
  email: true,
  id: true,
  name: true,
  totpSecret: true,
  userRoles: { select: { role: { select: { slug: true } } } },
  vatId: true
};

const clientSelect = {
  contacts: { orderBy: { createdAt: "desc" as const }, take: 1, select: { address: true, phone: true } },
  countryCode: true,
  customerType: true,
  domainRecords: { select: { id: true, domain: true, status: true } },
  email: true,
  id: true,
  invoices: { include: { items: true }, orderBy: { issuedAt: "desc" as const } },
  name: true,
  orders: { include: { invoice: true, items: true }, orderBy: { createdAt: "desc" as const } },
  segment: true,
  services: {
    include: { domainRecords: true, product: true, productPrice: true },
    orderBy: { createdAt: "desc" as const }
  },
  teams: true,
  userRoles: { select: { role: { select: { slug: true } } } },
  vatId: true
};

const pendingCheckoutEmail = "pending-checkout@dezhost.local";
