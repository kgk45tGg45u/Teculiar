import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { AgentAuditService } from "../../common/agent-audit.service";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { maskUserRef, shouldMask } from "../../common/pii-mask";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminCreateTicketDto } from "./dto/admin-create-ticket.dto";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { PublicInquiryDto } from "./dto/public-inquiry.dto";
import { type UploadedTicketFile } from "./ticket-files";
import { TicketsService } from "./tickets.service";

type AuthedRequest = Request & { user: { sub: string; roles?: string[] } };

function actorOf(request: AuthedRequest) {
  return { id: request.user.sub, roles: request.user.roles };
}

// The "agent" role (see FULL_ACCESS_ROLES in tickets.service.ts) can list/view every ticket like
// staff can, but ticket.user/ticket.assignee — and each reply's author on the detail view —
// carry customer PII that must be masked for it. Reply/note free-text bodies are not scanned
// (known gap, structural fields only).
type MaskableUser = { email: string; name: string; vatId?: string | null };
function maskTicket<
  T extends {
    assignee?: MaskableUser | null;
    user?: MaskableUser | null;
    replies?: Array<{ user?: MaskableUser | null }>;
  }
>(ticket: T): T {
  return {
    ...ticket,
    assignee: ticket.assignee ? maskUserRef(ticket.assignee) : ticket.assignee,
    user: ticket.user ? maskUserRef(ticket.user) : ticket.user,
    ...(ticket.replies
      ? { replies: ticket.replies.map((reply) => (reply.user ? { ...reply, user: maskUserRef(reply.user) } : reply)) }
      : {})
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tickets")
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly agentAudit: AgentAuditService
  ) {}

  @Get()
  async listTickets(
    @Req() request: AuthedRequest,
    @Query("status") status?: string,
    @Query("department") departmentId?: string
  ) {
    const tickets = await this.tickets.listTickets(actorOf(request), { status, departmentId });
    if (!shouldMask(request.user.roles)) return tickets;
    this.agentAudit.recordRead(request.user.sub, "tickets");
    return tickets.map(maskTicket);
  }

  @Post()
  createTicket(@Req() request: AuthedRequest, @Body() dto: CreateTicketDto) {
    return this.tickets.createTicket(request.user.sub, dto);
  }

  @Get("canned-replies")
  cannedReplies(@Query("department") departmentId?: string) {
    return this.tickets.listCannedReplies(departmentId);
  }

  @Get("departments")
  departments() {
    return this.tickets.listActiveDepartments();
  }

  @Get(":id")
  async getTicket(@Param("id") id: string, @Req() request: AuthedRequest) {
    const ticket = await this.tickets.getTicket(id, actorOf(request));
    if (!shouldMask(request.user.roles)) return ticket;
    this.agentAudit.recordRead(request.user.sub, "tickets", id);
    return maskTicket(ticket);
  }

  @Post(":id/replies")
  createReply(@Param("id") id: string, @Req() request: AuthedRequest, @Body() dto: CreateReplyDto) {
    return this.tickets.createReply(id, actorOf(request), dto);
  }

  @Post(":id/invoice-message")
  @Roles("admin", "super_admin", "staff", "support_agent", "sales_agent")
  invoiceMessage(@Param("id") id: string, @Req() request: AuthedRequest, @Body("invoiceId") invoiceId: string) {
    return this.tickets.createInvoiceMessage(id, actorOf(request), invoiceId);
  }

  @Post(":id/attachments")
  @UseInterceptors(FilesInterceptor("files", 5))
  uploadAttachments(
    @Param("id") id: string,
    @Req() request: AuthedRequest,
    @UploadedFiles() files?: UploadedTicketFile[],
    @Body("replyId") replyId?: string
  ) {
    return this.tickets.attachFiles(id, actorOf(request), files, replyId);
  }

  @Post(":id/close")
  closeTicket(@Param("id") id: string, @Req() request: AuthedRequest) {
    return this.tickets.closeTicket(id, actorOf(request));
  }

  @Patch(":id/assign")
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  assignTicket(@Param("id") id: string, @Body("staffId") staffId: string) {
    return this.tickets.assignTicket(id, staffId);
  }

  @Patch(":id/status")
  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  updateStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.tickets.updateStatus(id, status);
  }
}

@UseGuards(ThrottlerGuard)
@Controller("storefront/inquiries")
export class StorefrontInquiriesController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  createInquiry(@Body() dto: PublicInquiryDto) {
    return this.tickets.createPublicInquiry(dto);
  }
}

// "agent" (read-only, PII masked) added at class level for the GET below; POST opts back out
// explicitly (AgentWriteBlockGuard also structurally blocks it regardless).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff", "super_admin", "support_agent", "sales_agent", "agent")
@Controller("admin/dev/tickets")
export class TicketsDevController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly agentAudit: AgentAuditService
  ) {}

  @Get()
  async listTickets(@Req() request: AuthedRequest, @Query("status") status?: string, @Query("department") departmentId?: string) {
    const tickets = await this.tickets.listTickets(actorOf(request), { status, departmentId });
    if (!shouldMask(request.user.roles)) return tickets;
    this.agentAudit.recordRead(request.user.sub, "tickets");
    return tickets.map(maskTicket);
  }

  @Roles("admin", "staff", "super_admin", "support_agent", "sales_agent")
  @Post()
  createTicket(@Req() request: AuthedRequest, @Body() dto: AdminCreateTicketDto) {
    return this.tickets.createTicketAsAdmin(actorOf(request), dto);
  }

  @Post("maintenance")
  @Roles("admin", "super_admin")
  closeAnswered(@Body("closeAfterHours") closeAfterHours = 24) {
    return this.tickets.closeAnsweredTickets(Number(closeAfterHours));
  }
}
