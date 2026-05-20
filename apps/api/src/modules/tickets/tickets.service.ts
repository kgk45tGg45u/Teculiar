import { randomInt } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EmailService } from "../email/email.service";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { storeTicketFiles, type UploadedTicketFile } from "./ticket-files";
import { TicketsRepository } from "./tickets.repository";

@Injectable()
export class TicketsService {
  constructor(
    private readonly tickets: TicketsRepository,
    private readonly emails?: EmailService
  ) {}

  async createTicket(userId: string, dto: CreateTicketDto) {
    if (dto.priority === "URGENT" && !dto.paid) {
      throw new BadRequestException("Urgent tickets require a paid ticket credit");
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const ticket = await this.tickets.createTicket(userId, generateTicketPublicId(), dto);
        const fullTicket = await this.tickets.findTicket(ticket.id);
        void this.dispatchTicketEmail("ticket_opened", fullTicket ?? ticket, { ticket_content: dto.body }).catch(() => undefined);
        return ticket;
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
    void this.dispatchTicketEmail("ticket_answered", ticket, { ticket_reply: dto.body }).catch(() => undefined);
    return reply;
  }

  assignTicket(ticketId: string, staffId: string) {
    return this.tickets.assignTicket(ticketId, staffId);
  }

  async updateStatus(ticketId: string, status: string) {
    const ticket = await this.tickets.updateStatus(ticketId, status);
    if (status === "CLOSED") {
      const fullTicket = await this.tickets.findTicket(ticketId);
      void this.dispatchTicketEmail("ticket_closed", fullTicket ?? ticket).catch(() => undefined);
    }
    return ticket;
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
    const closed = await this.tickets.updateStatus(ticket.id, "CLOSED");
    void this.dispatchTicketEmail("ticket_closed", ticket).catch(() => undefined);
    return closed;
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

  private async dispatchTicketEmail(eventKey: string, ticket: Record<string, any> | null | undefined, extra: Record<string, unknown> = {}) {
    if (!this.emails || !ticket) {
      return [];
    }
    const user = isRecord(ticket.user) ? ticket.user : {};
    const firstReply = Array.isArray(ticket.replies) ? ticket.replies.find((reply) => !reply.internal) : undefined;
    return this.emails.dispatch(eventKey, {
      context: {
        customer_email: stringValue(user.email),
        customer_name: stringValue(user.name) ?? stringValue(user.email),
        ticket_content: stringValue(extra.ticket_content) ?? stringValue(firstReply?.body),
        ticket_id: ticket.publicId ?? ticket.id,
        ticket_reply: stringValue(extra.ticket_reply),
        ticket_status: ticket.status,
        ticket_subject: ticket.subject,
        ...extra
      },
      user: {
        email: stringValue(user.email),
        id: ticket.userId,
        locale: stringValue(user.locale),
        name: stringValue(user.name) ?? stringValue(user.email)
      }
    });
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
