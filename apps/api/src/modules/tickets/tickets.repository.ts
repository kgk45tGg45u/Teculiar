import { Injectable } from "@nestjs/common";
import { Prisma, TicketDepartment, TicketPriority, TicketStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createTicket(userId: string, publicId: string, dto: CreateTicketDto) {
    return this.prisma.ticket.create({
      data: {
        publicId,
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

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { email: true, id: true, name: true }
    });
  }

  async findOrCreateGuestUser(name: string, email: string): Promise<{ id: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true }
    });
    if (existing) {
      return existing;
    }
    return this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        passwordHash: `guest-inquiry-${Date.now()}`
      },
      select: { id: true }
    });
  }

  listTickets(filters: { status?: string; department?: string; departments?: string[]; userId?: string }) {
    const departmentFilter = filters.departments?.length
      ? { in: filters.departments as TicketDepartment[] }
      : filters.department
        ? { equals: filters.department as TicketDepartment }
        : undefined;
    return this.prisma.ticket.findMany({
      where: {
        userId: filters.userId,
        department: departmentFilter,
        status: filters.status ? (filters.status as TicketStatus) : undefined
      },
      include: { assignee: { select: publicUserSelect }, user: { select: publicUserSelect }, service: { include: { product: true } } },
      orderBy: { updatedAt: "desc" }
    });
  }

  findTicket(id: string) {
    return this.prisma.ticket.findFirst({
      where: { OR: [{ id }, { publicId: id }] },
      include: {
        attachments: { orderBy: { createdAt: "asc" } },
        internalNotes: true,
        replies: { include: { attachments: true, user: { select: publicUserSelect } }, orderBy: { createdAt: "asc" } },
        service: { include: { product: true } },
        user: { select: publicUserSelect }
      }
    });
  }

  createReply(input: { ticketId: string; userId: string; body: string; internal: boolean }) {
    return this.prisma.ticketReply.create({
      data: input,
      include: { attachments: true, user: { select: publicUserSelect } }
    });
  }

  findReply(id: string) {
    return this.prisma.ticketReply.findUnique({ where: { id } });
  }

  createAttachments(input: Array<{ fileName: string; mimeType: string; replyId?: string; sizeBytes: number; storageKey: string; ticketId: string }>) {
    if (input.length === 0) {
      return [];
    }
    return this.prisma.$transaction(input.map((data) => this.prisma.ticketAttachment.create({ data })));
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
      where: { status: { in: ["WAITING_ON_CLIENT", "ANSWERED"] }, updatedAt: { lte: cutoff } },
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
