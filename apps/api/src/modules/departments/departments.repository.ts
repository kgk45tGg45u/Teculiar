import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const memberSelect = {
  id: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, avatarUrl: true } }
} satisfies Prisma.DepartmentMemberSelect;

const departmentInclude = {
  members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }, orderBy: { createdAt: "asc" as const } }
} satisfies Prisma.DepartmentInclude;

@Injectable()
export class DepartmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.department.findMany({ include: departmentInclude, orderBy: { sortOrder: "asc" } });
  }

  listActive() {
    return this.prisma.department.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true, color: true },
      orderBy: { sortOrder: "asc" }
    });
  }

  find(id: string) {
    return this.prisma.department.findUnique({ where: { id }, include: departmentInclude });
  }

  findBySlug(slug: string) {
    return this.prisma.department.findUnique({ where: { slug } });
  }

  create(data: Prisma.DepartmentCreateInput) {
    return this.prisma.department.create({ data, include: departmentInclude });
  }

  update(id: string, data: Prisma.DepartmentUpdateInput) {
    return this.prisma.department.update({ where: { id }, data, include: departmentInclude });
  }

  delete(id: string) {
    return this.prisma.department.delete({ where: { id } });
  }

  ticketCount(departmentId: string) {
    return this.prisma.ticket.count({ where: { departmentId } });
  }

  clearDefault() {
    return this.prisma.department.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  addMember(departmentId: string, userId: string) {
    return this.prisma.departmentMember.upsert({
      where: { departmentId_userId: { departmentId, userId } },
      create: { departmentId, userId },
      update: {},
      select: memberSelect
    });
  }

  removeMember(departmentId: string, userId: string) {
    return this.prisma.departmentMember.deleteMany({ where: { departmentId, userId } });
  }

  // Department ids a staff member belongs to (drives ticket visibility).
  async memberDepartmentIds(userId: string) {
    const rows = await this.prisma.departmentMember.findMany({ where: { userId }, select: { departmentId: true } });
    return rows.map((row) => row.departmentId);
  }

  // ── Public-form routing (stored in SystemSetting) ─────────────────────────────

  async getRoutingDepartmentId(key: "contactFormDepartmentId" | "inquiryFormDepartmentId") {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    return typeof setting?.value === "string" ? setting.value : undefined;
  }

  setRoutingDepartmentId(key: "contactFormDepartmentId" | "inquiryFormDepartmentId", departmentId: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: departmentId },
      update: { value: departmentId }
    });
  }

  defaultDepartment() {
    return this.prisma.department.findFirst({
      where: { active: true },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }]
    });
  }
}
