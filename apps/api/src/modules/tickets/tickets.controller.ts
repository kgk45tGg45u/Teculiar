import { Body, Controller, Get, Param, Patch, Post, Query, Req, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { type UploadedTicketFile } from "./ticket-files";
import { TicketsService } from "./tickets.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tickets")
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  listTickets(
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Query("status") status?: string,
    @Query("department") department?: string
  ) {
    const staff = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.tickets.listTickets({
      status,
      department,
      userId: staff ? undefined : request.user.sub
    });
  }

  @Post()
  createTicket(@Req() request: Request & { user: { sub: string } }, @Body() dto: CreateTicketDto) {
    return this.tickets.createTicket(request.user.sub, dto);
  }

  @Get("canned-replies")
  cannedReplies(@Query("department") department?: string) {
    return this.tickets.listCannedReplies(department);
  }

  @Get(":id")
  getTicket(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    const staff = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.tickets.getTicket(id, request.user.sub, staff);
  }

  @Post(":id/replies")
  createReply(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @Body() dto: CreateReplyDto
  ) {
    const staff = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.tickets.createReply(id, request.user.sub, dto, staff);
  }

  @Post(":id/attachments")
  @UseInterceptors(FilesInterceptor("files", 5))
  uploadAttachments(
    @Param("id") id: string,
    @Req() request: Request & { user: { sub: string; roles?: string[] } },
    @UploadedFiles() files?: UploadedTicketFile[],
    @Body("replyId") replyId?: string
  ) {
    const staff = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.tickets.attachFiles(id, request.user.sub, files, staff, replyId);
  }

  @Post(":id/close")
  closeTicket(@Param("id") id: string, @Req() request: Request & { user: { sub: string; roles?: string[] } }) {
    const staff = request.user.roles?.some((role) => ["admin", "staff"].includes(role));
    return this.tickets.closeTicket(id, request.user.sub, staff);
  }

  @Patch(":id/assign")
  @Roles("admin", "staff")
  assignTicket(@Param("id") id: string, @Body("staffId") staffId: string) {
    return this.tickets.assignTicket(id, staffId);
  }

  @Patch(":id/status")
  @Roles("admin", "staff")
  updateStatus(@Param("id") id: string, @Body("status") status: string) {
    return this.tickets.updateStatus(id, status);
  }

}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "staff")
@Controller("admin/dev/tickets")
export class TicketsDevController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  listTickets() {
    return this.tickets.listTickets({});
  }

  @Post("maintenance")
  closeAnswered(@Body("closeAfterHours") closeAfterHours = 24) {
    return this.tickets.closeAnsweredTickets(Number(closeAfterHours));
  }
}
