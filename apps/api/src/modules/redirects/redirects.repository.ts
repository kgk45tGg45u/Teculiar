import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RedirectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.redirect.findMany({ orderBy: { fromPath: "asc" } });
  }

  enabled() {
    return this.prisma.redirect.findMany({ where: { enabled: true }, orderBy: { fromPath: "asc" } });
  }

  byId(id: string) {
    return this.prisma.redirect.findUnique({ where: { id } });
  }

  byFromPath(fromPath: string) {
    return this.prisma.redirect.findUnique({ where: { fromPath } });
  }

  create(data: Prisma.RedirectUncheckedCreateInput) {
    return this.prisma.redirect.create({ data });
  }

  update(id: string, data: Prisma.RedirectUncheckedUpdateInput) {
    return this.prisma.redirect.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.redirect.delete({ where: { id } });
  }
}
