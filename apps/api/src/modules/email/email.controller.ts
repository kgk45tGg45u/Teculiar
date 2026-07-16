import { BadRequestException } from "@nestjs/common";
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { deepMaskPii, shouldMask } from "../../common/pii-mask";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { EmailLayoutBlock } from "./email-layouts";
import { EmailService } from "./email.service";

@UseGuards(JwtAuthGuard, RolesGuard)
// "agent" (read-only, PII masked) may VIEW the email pages: the GETs below deep-mask recipient
// addresses and payloads (the SMTP password is already redacted for everyone via publicSmtp).
// Every mutating route here — updateSettings and the real sends (test/test-connection/
// send-event/send-custom) — is structurally 403'd for agent by AgentWriteBlockGuard's
// /admin/dev/emails prefix.
@Roles("admin", "staff", "super_admin", "agent")
@Controller("admin/dev/emails")
export class EmailAdminController {
  constructor(private readonly emails: EmailService) {}

  @Get()
  async settings(@Req() request: Request & { user: { roles?: string[] } }) {
    const settings = await this.emails.adminSettings();
    return shouldMask(request.user.roles) ? deepMaskPii(settings) : settings;
  }

  @Get("logs")
  async logs(@Req() request: Request & { user: { roles?: string[] } }, @Query("limit") limit?: string) {
    const logs = await this.emails.listLogs(limit ? Number(limit) : undefined);
    return shouldMask(request.user.roles) ? deepMaskPii(logs) : logs;
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
  test(@Body() body: { context?: Record<string, unknown>; eventKey?: string; to?: string }) {
    return this.emails.sendTest(body.eventKey ?? "new_invoice", body.context ?? {}, body.to);
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
