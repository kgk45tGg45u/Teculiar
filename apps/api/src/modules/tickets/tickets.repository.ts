import { Injectable } from "@nestjs/common";
import { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createTicket(input: {
    ownerId: string;
    authorId: string;
    publicId: string;
    departmentId: string;
    subject: string;
    body: string;
    priority?: string;
    serviceId?: string;
    paid?: boolean;
    assigneeId?: string;
    status?: string;
  }) {
    return this.prisma.ticket.create({
      data: {
        publicId: input.publicId,
        userId: input.ownerId,
        departmentId: input.departmentId,
        assigneeId: input.assigneeId,
        subject: input.subject,
        priority: (input.priority ?? "NORMAL") as TicketPriority,
        status: (input.status ?? "OPEN") as TicketStatus,
        serviceId: input.serviceId,
        paid: Boolean(input.paid),
        replies: {
          create: {
            userId: input.authorId,
            body: input.body,
            internal: false
          }
        }
      },
      include: { replies: true }
    });
  }

  departmentExists(id: string) {
    return this.prisma.department.findUnique({ where: { id }, select: { id: true } });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, isGuest: true } });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email_scope: { email: email.toLowerCase(), scope: "CLIENT" } },
      select: { email: true, id: true, name: true, isGuest: true }
    });
  }

  async findOrCreateGuestUser(name: string, email: string): Promise<{ id: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email_scope: { email: email.toLowerCase(), scope: "CLIENT" } },
      select: { id: true }
    });
    if (existing) {
      return existing;
    }
    return this.prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        isGuest: true,
        passwordHash: `guest-inquiry-${Date.now()}`
      },
      select: { id: true }
    });
  }

  // Department ids a staff member belongs to (drives ticket visibility for
  // department-scoped agents).
  async memberDepartmentIds(userId: string) {
    const rows = await this.prisma.departmentMember.findMany({ where: { userId }, select: { departmentId: true } });
    return rows.map((row) => row.departmentId);
  }

  listTickets(filters: { status?: string; departmentId?: string; departmentIds?: string[]; userId?: string }) {
    const departmentFilter = filters.departmentIds
      ? { in: filters.departmentIds }
      : filters.departmentId
        ? filters.departmentId
        : undefined;
    return this.prisma.ticket.findMany({
      where: {
        userId: filters.userId,
        departmentId: departmentFilter,
        status: filters.status ? (filters.status as TicketStatus) : undefined
      },
      include: {
        assignee: { select: publicUserSelect },
        user: { select: publicUserSelect },
        department: { select: departmentSelect },
        service: { include: { product: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  findTicket(id: string) {
    return this.prisma.ticket.findFirst({
      where: { OR: [{ id }, { publicId: id }] },
      include: {
        attachments: { orderBy: { createdAt: "asc" } },
        internalNotes: true,
        department: { select: departmentSelect },
        assignee: { select: publicUserSelect },
        replies: {
          include: { attachments: true, user: { select: publicUserSelect }, invoice: { select: invoiceSelect } },
          orderBy: { createdAt: "asc" }
        },
        service: { include: { product: true } },
        user: { select: publicUserSelect }
      }
    });
  }

  // Hard delete — TicketReply/TicketInternalNote/TicketAttachment cascade in the schema.
  deleteTicket(id: string) {
    return this.prisma.ticket.delete({ where: { id } });
  }

  createReply(input: { ticketId: string; userId: string; body: string; internal: boolean; system?: boolean; invoiceId?: string }) {
    return this.prisma.ticketReply.create({
      data: input,
      include: { attachments: true, user: { select: publicUserSelect }, invoice: { select: invoiceSelect } }
    });
  }

  findReply(id: string) {
    return this.prisma.ticketReply.findUnique({ where: { id } });
  }

  findInvoiceForUser(invoiceId: string, userId: string) {
    return this.prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      select: invoiceSelect
    });
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
      data: { assigneeId: staffId }
    });
  }

  updateStatus(ticketId: string, status: string) {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: status as TicketStatus }
    });
  }

  listCannedReplies(departmentId?: string) {
    return this.prisma.cannedReply.findMany({
      where: departmentId ? { departmentId } : undefined,
      orderBy: { title: "asc" }
    });
  }

  // Answered tickets that have gone stale (no client reply within the window).
  // Returns the user + department so the cron can email each client on close.
  findAnsweredOlderThan(cutoff: Date) {
    return this.prisma.ticket.findMany({
      where: { status: "ANSWERED", updatedAt: { lte: cutoff } },
      include: { user: { select: publicUserSelect }, department: { select: departmentSelect } }
    });
  }
}

const departmentSelect = {
  id: true,
  slug: true,
  name: true,
  color: true
} satisfies Prisma.DepartmentSelect;

const invoiceSelect = {
  id: true,
  invoiceNumber: true,
  tempInvoiceNumber: true,
  finalInvoiceNumber: true,
  status: true,
  totalCents: true,
  currency: true,
  dueAt: true
} satisfies Prisma.InvoiceSelect;

const publicUserSelect = {
  avatarUrl: true,
  countryCode: true,
  customerType: true,
  email: true,
  id: true,
  isGuest: true,
  locale: true,
  name: true,
  segment: true,
  vatId: true
} satisfies Prisma.UserSelect;
