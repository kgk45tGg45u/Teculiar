import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto, DepartmentMemberDto, FormRoutingDto, UpdateDepartmentDto } from "./dto/department.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "super_admin", "staff", "support_agent", "sales_agent", "agent")
@Controller("admin/dev/departments")
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  list() {
    return this.departments.list();
  }

  @Get("routing")
  routing() {
    return this.departments.getRouting();
  }

  @Put("routing")
  @Roles("admin", "super_admin")
  setRouting(@Body() dto: FormRoutingDto) {
    return this.departments.setRouting(dto);
  }

  @Post()
  @Roles("admin", "super_admin")
  create(@Body() dto: CreateDepartmentDto) {
    return this.departments.create(dto);
  }

  @Patch(":id")
  @Roles("admin", "super_admin")
  update(@Param("id") id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departments.update(id, dto);
  }

  @Delete(":id")
  @Roles("admin", "super_admin")
  remove(@Param("id") id: string) {
    return this.departments.remove(id);
  }

  @Post(":id/members")
  @Roles("admin", "super_admin")
  addMember(@Param("id") id: string, @Body() dto: DepartmentMemberDto) {
    return this.departments.addMember(id, dto.userId);
  }

  @Delete(":id/members/:userId")
  @Roles("admin", "super_admin")
  removeMember(@Param("id") id: string, @Param("userId") userId: string) {
    return this.departments.removeMember(id, userId);
  }
}
