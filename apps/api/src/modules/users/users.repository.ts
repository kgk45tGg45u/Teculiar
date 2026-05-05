import { Injectable } from "@nestjs/common";
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
      include: { userRoles: { include: { role: true } } }
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
