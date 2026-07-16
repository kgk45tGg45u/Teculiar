import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { hash } from "bcryptjs";
import type { Request } from "express";
import { AgentAuditService } from "../../common/agent-audit.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { maskClient, shouldMask } from "../../common/pii-mask";
import { IMAGE_TYPES, storeUploadedFiles, type UploadedFile } from "../../common/uploads";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly agentAudit: AgentAuditService
  ) {}

  @Get("me")
  me(@Req() request: Request & { user: { email?: string; roles?: string[]; sub: string } }) {
    if (request.user.sub === "emergency-admin") {
      return {
        email: request.user.email ?? process.env.EMERGENCY_ADMIN_EMAIL ?? "emergency-admin",
        id: request.user.sub,
        roles: request.user.roles ?? ["admin"]
      };
    }
    return this.users.getMe(request.user.sub);
  }

  @Patch("me")
  updateMe(@Req() request: Request & { user: { sub: string } }, @Body() body: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
    locale?: string;
    name?: string;
    phone?: string;
    vatId?: string;
  }) {
    return this.users.updateProfile(request.user.sub, body);
  }

  @Get("me/export")
  exportMe(@Req() request: Request & { user: { sub: string } }) {
    return this.users.exportAccount(request.user.sub);
  }

  @Delete("me")
  deleteMe(@Req() request: Request & { user: { sub: string } }) {
    return this.users.requestDeletion(request.user.sub);
  }

  // "agent" (read-only, PII masked) added only to the two GET routes below — never to the
  // mutating routes in this controller. AgentWriteBlockGuard also structurally blocks agent
  // from any non-GET request regardless of this list.
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
  @Get()
  async clients(@Req() request: Request & { user: { roles?: string[]; sub: string } }) {
    const clients = await this.users.listClients();
    if (!shouldMask(request.user.roles)) return clients;
    this.agentAudit.recordRead(request.user.sub, "users");
    return clients.map(maskClient);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post()
  createClient(@Body() body: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email: string;
    name: string;
    password: string;
    phone?: string;
    vatId?: string;
  }) {
    return this.users.createClient(body);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
  @Get(":id")
  async client(@Param("id") id: string, @Req() request: Request & { user: { roles?: string[]; sub: string } }) {
    const client = await this.users.getClient(id);
    if (!client || !shouldMask(request.user.roles)) return client;
    this.agentAudit.recordRead(request.user.sub, "users", id);
    return maskClient(client);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Patch(":id")
  updateClient(@Param("id") id: string, @Body() body: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
    name?: string;
    phone?: string;
    segment?: string;
    vatId?: string;
  }) {
    return this.users.updateClient(id, body);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Delete(":id")
  deleteClient(@Param("id") id: string) {
    return this.users.deleteClient(id);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Patch(":id/segment")
  updateSegment(@Param("id") id: string, @Body("segment") segment: string) {
    return this.users.updateSegment(id, segment);
  }
}

// ── Admin user management (super_admin only) ──────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "super_admin")
@Controller("admin/dev/admins")
export class AdminManagementController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.listAdminUsers();
  }

  @Get("roles")
  roles() {
    return [
      { slug: "super_admin", name: "Super Admin", description: "Full access to all features including settings" },
      { slug: "support_agent", name: "Support Agent", description: "Access to support & abuse tickets, all client data. No settings." },
      { slug: "sales_agent", name: "Sales Agent", description: "Access to sales tickets, all client data. No settings." },
      { slug: "agent", name: "Agent (Read-Only, Masked)", description: "Automated dashboard testing credential. Can view every page with customer PII masked; cannot modify customer data, send email, or trigger provisioning/cron." }
    ];
  }

  @Post()
  async create(@Body() body: { email: string; name: string; password: string; roleSlug: string }) {
    if (!body.email || !body.name || !body.password || !body.roleSlug) {
      throw new BadRequestException("email, name, password, and roleSlug are required");
    }
    const validRoles = ["super_admin", "support_agent", "sales_agent", "agent"];
    if (!validRoles.includes(body.roleSlug)) {
      throw new BadRequestException(`roleSlug must be one of: ${validRoles.join(", ")}`);
    }
    const passwordHash = await hash(body.password, 12);
    return this.users.createAdminUser({ email: body.email, name: body.name, passwordHash, roleSlug: body.roleSlug });
  }

  @Patch(":id/role")
  updateRole(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string } },
    @Body("roleSlug") roleSlug: string
  ) {
    const validRoles = ["super_admin", "support_agent", "sales_agent", "agent"];
    if (!validRoles.includes(roleSlug)) {
      throw new BadRequestException(`roleSlug must be one of: ${validRoles.join(", ")}`);
    }
    return this.users.updateAdminUserRole(id, roleSlug);
  }

  @Patch(":id/password")
  async updatePassword(@Param("id") id: string, @Body("password") password: string) {
    if (!password || password.length < 12) {
      throw new BadRequestException("Password must be at least 12 characters");
    }
    const passwordHash = await hash(password, 12);
    return this.users.updateAdminUserPassword(id, passwordHash);
  }

  @Post(":id/avatar")
  @UseInterceptors(FilesInterceptor("files", 1))
  async uploadAvatar(@Param("id") id: string, @UploadedFiles() files?: UploadedFile[]) {
    const [stored] = await storeUploadedFiles(files, { subdir: "avatars", maxFiles: 1, maxBytes: 4_000_000, allow: IMAGE_TYPES });
    if (!stored) {
      throw new BadRequestException("An image file is required.");
    }
    return this.users.setAdminAvatar(id, stored.storageKey);
  }

  @Delete(":id")
  async deleteAdmin(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string } }
  ) {
    if (id === request.user.sub) {
      throw new ForbiddenException("Cannot delete your own admin account");
    }
    return this.users.deleteAdminUser(id);
  }
}
