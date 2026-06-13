import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { storeUploadedFiles, type UploadedFile } from "../../common/uploads";
import { CreateDepartmentDto, FormRoutingDto, UpdateDepartmentDto } from "./dto/department.dto";
import { DepartmentsRepository } from "./departments.repository";

@Injectable()
export class DepartmentsService {
  constructor(private readonly departments: DepartmentsRepository) {}

  list() {
    return this.departments.list();
  }

  listActive() {
    return this.departments.listActive();
  }

  async create(dto: CreateDepartmentDto) {
    const slug = slugify(dto.slug ?? dto.name);
    if (!slug) {
      throw new BadRequestException("A department name or slug is required.");
    }
    if (await this.departments.findBySlug(slug)) {
      throw new ConflictException(`A department with slug "${slug}" already exists.`);
    }
    if (dto.isDefault) {
      await this.departments.clearDefault();
    }
    return this.departments.create({
      name: dto.name,
      slug,
      email: dto.email ?? null,
      color: dto.color ?? null,
      active: dto.active ?? true,
      isDefault: dto.isDefault ?? false,
      sortOrder: dto.sortOrder ?? 0
    });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.requireDepartment(id);
    if (dto.isDefault) {
      await this.departments.clearDefault();
    }
    return this.departments.update(id, {
      name: dto.name,
      email: dto.email,
      color: dto.color,
      active: dto.active,
      isDefault: dto.isDefault,
      sortOrder: dto.sortOrder
    });
  }

  async remove(id: string) {
    await this.requireDepartment(id);
    const ticketCount = await this.departments.ticketCount(id);
    if (ticketCount > 0) {
      throw new ConflictException(`Cannot delete a department with ${ticketCount} ticket(s). Reassign them first.`);
    }
    await this.departments.delete(id);
    return { ok: true };
  }

  async addMember(departmentId: string, userId: string) {
    await this.requireDepartment(departmentId);
    return this.departments.addMember(departmentId, userId);
  }

  async removeMember(departmentId: string, userId: string) {
    await this.requireDepartment(departmentId);
    await this.departments.removeMember(departmentId, userId);
    return { ok: true };
  }

  async getRouting() {
    return {
      contactFormDepartmentId: (await this.departments.getRoutingDepartmentId("contactFormDepartmentId")) ?? null,
      inquiryFormDepartmentId: (await this.departments.getRoutingDepartmentId("inquiryFormDepartmentId")) ?? null
    };
  }

  async setRouting(dto: FormRoutingDto) {
    if (dto.contactFormDepartmentId) {
      await this.requireDepartment(dto.contactFormDepartmentId);
      await this.departments.setRoutingDepartmentId("contactFormDepartmentId", dto.contactFormDepartmentId);
    }
    if (dto.inquiryFormDepartmentId) {
      await this.requireDepartment(dto.inquiryFormDepartmentId);
      await this.departments.setRoutingDepartmentId("inquiryFormDepartmentId", dto.inquiryFormDepartmentId);
    }
    return this.getRouting();
  }

  private async requireDepartment(id: string) {
    const department = await this.departments.find(id);
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    return department;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export { storeUploadedFiles, type UploadedFile };
