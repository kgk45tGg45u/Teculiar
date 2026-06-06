import { BadRequestException } from "@nestjs/common";
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { EmailLayoutBlock } from "./email-layouts";
import { EmailService } from "./email.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff")
@Controller("admin/dev/emails")
export class EmailAdminController {
  constructor(private readonly emails: EmailService) {}

  @Get()
  settings() {
    return this.emails.adminSettings();
  }

  @Get("logs")
  logs(@Query("limit") limit?: string) {
    return this.emails.listLogs(limit ? Number(limit) : undefined);
  }

  @Patch()
  updateSettings(@Body() body: {
    events?: Array<{ body?: string; enabled?: boolean; key: string; layoutBlocks?: EmailLayoutBlock[]; recipients?: string[]; subject?: string }>;
    smtp?: {
      adminEmails?: string[] | string;
      enabled?: boolean;
      fromEmail?: string;
      fromName?: string;
      host?: string;
      password?: string;
      port?: number;
      replyTo?: string;
      secure?: boolean;
      username?: string;
    };
    templateHtml?: string;
    testVariables?: Record<string, unknown>;
  }) {
    return this.emails.updateSettings(body);
  }

  @Post("test")
  test(@Body() body: { context?: Record<string, unknown>; eventKey?: string }) {
    return this.emails.sendTest(body.eventKey ?? "new_invoice", body.context ?? {});
  }

  @Post("test-connection")
  testConnection(@Body() body: {
    smtp?: {
      enabled?: boolean;
      fromEmail?: string;
      fromName?: string;
      host?: string;
      password?: string;
      port?: number;
      replyTo?: string;
      secure?: boolean;
      username?: string;
    };
  }) {
    return this.emails.testSmtpConnection(body.smtp);
  }

  @Post("users/:userId/send-event")
  sendEventToUser(@Param("userId") userId: string, @Body() body: { eventKey: string }) {
    if (!body.eventKey) throw new BadRequestException("eventKey is required");
    return this.emails.sendEventToUser(userId, body.eventKey);
  }

  @Post("users/:userId/send-custom")
  sendCustomToUser(@Param("userId") userId: string, @Body() body: { body: string; subject: string }) {
    if (!body.subject || !body.body) throw new BadRequestException("subject and body are required");
    return this.emails.sendCustomToUser(userId, body.subject, body.body);
  }
}
