import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UsersService } from "./users.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  me(@Req() request: Request & { user: { sub: string } }) {
    return this.users.getMe(request.user.sub);
  }

  @Patch("me")
  updateMe(@Req() request: Request & { user: { sub: string } }, @Body() body: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
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

  @Roles("admin", "staff")
  @Get()
  clients() {
    return this.users.listClients();
  }

  @Roles("admin", "staff")
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

  @Roles("admin", "staff")
  @Get(":id")
  client(@Param("id") id: string) {
    return this.users.getClient(id);
  }

  @Roles("admin", "staff")
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

  @Roles("admin", "staff")
  @Delete(":id")
  deleteClient(@Param("id") id: string) {
    return this.users.deleteClient(id);
  }

  @Roles("admin", "staff")
  @Patch(":id/segment")
  updateSegment(@Param("id") id: string, @Body("segment") segment: string) {
    return this.users.updateSegment(id, segment);
  }
}
