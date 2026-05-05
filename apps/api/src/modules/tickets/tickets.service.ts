import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { TicketsRepository } from "./tickets.repository";

@Injectable()
export class TicketsService {
  constructor(private readonly tickets: TicketsRepository) {}

  createTicket(userId: string, dto: CreateTicketDto) {
    if (dto.priority === "URGENT" && !dto.paid) {
      throw new BadRequestException("Urgent tickets require a paid ticket credit");
    }

    return this.tickets.createTicket(userId, dto);
  }

  listTickets(filters: { status?: string; department?: string; userId?: string }) {
    return this.tickets.listTickets(filters);
  }

  async getTicket(id: string) {
    const ticket = await this.tickets.findTicket(id);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    return ticket;
  }

  async createReply(ticketId: string, userId: string, dto: CreateReplyDto, staff = false) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    if (dto.internal) {
      return this.tickets.createInternalNote({ ticketId, staffId: userId, body: dto.body });
    }

    const reply = await this.tickets.createReply({
      ticketId,
      userId,
      body: dto.body,
      internal: false
    });

    await this.tickets.touchTicket(ticketId, staff ? "WAITING_ON_CLIENT" : "WAITING_ON_STAFF");
    return reply;
  }

  assignTicket(ticketId: string, staffId: string) {
    return this.tickets.assignTicket(ticketId, staffId);
  }

  updateStatus(ticketId: string, status: string) {
    return this.tickets.updateStatus(ticketId, status);
  }

  listCannedReplies(department?: string) {
    return this.tickets.listCannedReplies(department);
  }

  closeAnsweredTickets(closeAfterHours: number, now = new Date()) {
    const cutoff = new Date(now.getTime() - closeAfterHours * 60 * 60 * 1000);
    return this.tickets.closeAnsweredOlderThan(cutoff);
  }
}
