import { Injectable } from "@nestjs/common";
import { Prisma, TicketDepartment, TicketPriority, TicketStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createTicket(userId: string, dto: CreateTicketDto) {
    return this.prisma.ticket.create({
      data: {
        userId,
        subject: dto.subject,
        department: dto.department as TicketDepartment,
        priority: (dto.priority ?? "NORMAL") as TicketPriority,
        serviceId: dto.serviceId,
        paid: Boolean(dto.paid),
        replies: {
          create: {
            userId,
            body: dto.body,
            internal: false
          }
        }
      },
      include: { replies: true }
    });
  }

  listTickets(filters: { status?: string; department?: string; userId?: string }) {
    return this.prisma.ticket.findMany({
      where: {
        ...filters,
        department: filters.department ? (filters.department as TicketDepartment) : undefined,
        status: filters.status ? (filters.status as TicketStatus) : undefined
      },
      include: { assignee: { select: publicUserSelect }, user: { select: publicUserSelect }, service: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
    });
  }

  findTicket(id: string) {
    return this.prisma.ticket.findUnique({
      where: { id },
      include: {
        attachments: true,
        internalNotes: true,
        replies: { include: { user: { select: publicUserSelect } }, orderBy: { createdAt: "desc" } },
        service: { include: { product: true } },
        user: { select: publicUserSelect }
      }
    });
  }

  createReply(input: { ticketId: string; userId: string; body: string; internal: boolean }) {
    return this.prisma.ticketReply.create({
      data: input
    });
  }

  touchTicket(ticketId: string, status: string) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: status as TicketStatus }
    });
  }

  createInternalNote(input: { ticketId: string; staffId: string; body: string }) {
    return this.prisma.ticketInternalNote.create({ data: input });
  }

  assignTicket(ticketId: string, staffId: string) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { assigneeId: staffId, status: "OPEN" }
    });
  }

  updateStatus(ticketId: string, status: string) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: status as TicketStatus }
    });
  }

  listCannedReplies(department?: string) {
    return this.prisma.cannedReply.findMany({
      where: department ? { department: department as TicketDepartment } : undefined,
      orderBy: { title: "asc" }
    });
  }

  closeAnsweredOlderThan(cutoff: Date) {
    return this.prisma.ticket.updateMany({
      where: { status: "WAITING_ON_CLIENT", updatedAt: { lte: cutoff } },
      data: { status: "CLOSED" }
    });
  }
}

const publicUserSelect = {
  countryCode: true,
  customerType: true,
  email: true,
  id: true,
  locale: true,
  name: true,
  segment: true,
  vatId: true
} satisfies Prisma.UserSelect;
