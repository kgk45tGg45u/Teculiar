import { randomInt } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { storeTicketFiles, type UploadedTicketFile } from "./ticket-files";
import { TicketsRepository } from "./tickets.repository";

@Injectable()
export class TicketsService {
  constructor(private readonly tickets: TicketsRepository) {}

  async createTicket(userId: string, dto: CreateTicketDto) {
    if (dto.priority === "URGENT" && !dto.paid) {
      throw new BadRequestException("Urgent tickets require a paid ticket credit");
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.tickets.createTicket(userId, generateTicketPublicId(), dto);
      } catch (error) {
        if (!isUniqueCollision(error) || attempt === 7) {
          throw error;
        }
      }
    }
    throw new BadRequestException("Could not create ticket id.");
  }

  listTickets(filters: { status?: string; department?: string; userId?: string }) {
    return this.tickets.listTickets(filters);
  }

  async getTicket(id: string, userId: string, staff = false) {
    const ticket = await this.tickets.findTicket(id);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }

    this.assertTicketAccess(ticket, userId, staff);
    return ticket;
  }

  async createReply(ticketId: string, userId: string, dto: CreateReplyDto, staff = false) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    this.assertTicketAccess(ticket, userId, staff);

    if (dto.internal) {
      if (!staff) {
        throw new BadRequestException("Internal notes are staff only.");
      }
      return this.tickets.createInternalNote({ ticketId, staffId: userId, body: dto.body });
    }

    const reply = await this.tickets.createReply({
      ticketId,
      userId,
      body: dto.body,
      internal: false
    });

    await this.tickets.touchTicket(ticket.id, staff ? "ANSWERED" : "CUSTOMER_REPLY");
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

  async closeTicket(ticketId: string, userId: string, staff = false) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    this.assertTicketAccess(ticket, userId, staff);
    return this.tickets.updateStatus(ticket.id, "CLOSED");
  }

  async attachFiles(ticketId: string, userId: string, files?: UploadedTicketFile[], staff = false, replyId?: string) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    this.assertTicketAccess(ticket, userId, staff);

    if (replyId) {
      const reply = await this.tickets.findReply(replyId);
      if (!reply || reply.ticketId !== ticket.id) {
        throw new BadRequestException("Reply does not belong to this ticket.");
      }
    }

    const stored = await storeTicketFiles(files);
    return this.tickets.createAttachments(stored.map((file) => ({ ...file, replyId, ticketId: ticket.id })));
  }

  private assertTicketAccess(ticket: { userId: string }, userId: string, staff: boolean) {
    if (!staff && ticket.userId !== userId) {
      throw new NotFoundException("Ticket not found");
    }
  }
}

const TICKET_ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateTicketPublicId() {
  let id = "";
  for (let index = 0; index < 8; index += 1) {
    id += TICKET_ID_ALPHABET[randomInt(TICKET_ID_ALPHABET.length)];
  }
  return id;
}

function isUniqueCollision(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
