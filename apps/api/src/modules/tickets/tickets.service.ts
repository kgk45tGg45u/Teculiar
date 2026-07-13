import { randomInt } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DepartmentsRepository } from "../departments/departments.repository";
import { EmailService } from "../email/email.service";
import { AdminCreateTicketDto } from "./dto/admin-create-ticket.dto";
import { CreateReplyDto } from "./dto/create-reply.dto";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { PublicInquiryDto } from "./dto/public-inquiry.dto";
import { fetchUnreadImapMessages, type ImapMailboxConfig, type ImapMessage } from "./imap-mailbox";
import { storeTicketFiles, type UploadedTicketFile } from "./ticket-files";
import { TicketsRepository } from "./tickets.repository";
import { tenantClientUrl } from "../../tenancy/tenant-urls";

export type TicketActor = { id: string; roles?: string[] };

const FULL_ACCESS_ROLES = ["admin", "super_admin", "staff"];
const STAFF_ROLES = ["admin", "super_admin", "staff", "support_agent", "sales_agent"];

@Injectable()
export class TicketsService {
  constructor(
    private readonly tickets: TicketsRepository,
    private readonly departments: DepartmentsRepository,
    private readonly emails?: EmailService
  ) {}

  // ── Creation ──────────────────────────────────────────────────────────────────

  async createTicket(userId: string, dto: CreateTicketDto) {
    if (dto.priority === "URGENT" && !dto.paid) {
      throw new BadRequestException("Urgent tickets require a paid ticket credit");
    }
    const departmentId = await this.requireDepartmentId(dto.departmentId);
    return this.persistTicket({
      ownerId: userId,
      authorId: userId,
      departmentId,
      subject: dto.subject,
      body: dto.body,
      priority: dto.priority,
      serviceId: dto.serviceId,
      paid: dto.paid,
      status: "OPEN",
      emailEvent: "ticket_opened"
    });
  }

  // System/internal ticket creation by slug (e.g. billing notifications). Falls
  // back to the default department when the slug is unknown.
  async createTicketForSlug(ownerId: string, input: { subject: string; body: string; departmentSlug?: string; priority?: string }) {
    const department = (input.departmentSlug ? await this.departments.findBySlug(input.departmentSlug) : null) ?? (await this.departments.defaultDepartment());
    if (!department) {
      throw new BadRequestException("No department available to receive this ticket.");
    }
    return this.persistTicket({
      ownerId,
      authorId: ownerId,
      departmentId: department.id,
      subject: input.subject,
      body: input.body,
      priority: input.priority ?? "NORMAL",
      status: "OPEN",
      emailEvent: "ticket_opened"
    });
  }

  // Admin-initiated ticket: owner is the chosen client/guest, author is the admin.
  async createTicketAsAdmin(actor: TicketActor, dto: AdminCreateTicketDto) {
    const departmentId = await this.requireDepartmentId(dto.departmentId);

    let ownerId = dto.userId;
    if (!ownerId) {
      if (!dto.email || !dto.name) {
        throw new BadRequestException("Provide a userId, or a name and email for a new recipient.");
      }
      const guest = await this.tickets.findOrCreateGuestUser(dto.name, dto.email);
      ownerId = guest.id;
    } else {
      const owner = await this.tickets.findUserById(ownerId);
      if (!owner) {
        throw new NotFoundException("Recipient not found");
      }
    }

    return this.persistTicket({
      ownerId,
      authorId: actor.id,
      departmentId,
      subject: dto.subject,
      body: dto.body,
      priority: dto.priority,
      assigneeId: actor.id,
      status: "ANSWERED",
      emailEvent: "ticket_answered"
    });
  }

  async createPublicInquiry(dto: PublicInquiryDto) {
    if (dto._honey) {
      return { ok: true };
    }

    const phoneInfo = dto.phone ? `\n\nTelefon: ${dto.phone}` : "";
    const body = `Name: ${dto.name}\nE-Mail: ${dto.email}${phoneInfo}\n\n${dto.message}`;

    const routingKey = dto.source === "inquiry" ? "inquiryFormDepartmentId" : "contactFormDepartmentId";
    const departmentId = await this.resolveRoutedDepartmentId(routingKey);
    const user = await this.tickets.findOrCreateGuestUser(dto.name, dto.email);

    return this.persistTicket({
      ownerId: user.id,
      authorId: user.id,
      departmentId,
      subject: dto.subject,
      body,
      priority: "NORMAL",
      status: "OPEN",
      emailEvent: "ticket_opened"
    });
  }

  private async persistTicket(input: {
    ownerId: string;
    authorId: string;
    departmentId: string;
    subject: string;
    body: string;
    priority?: string;
    serviceId?: string;
    paid?: boolean;
    assigneeId?: string;
    status: string;
    emailEvent: string;
  }) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const ticket = await this.tickets.createTicket({ ...input, publicId: generateTicketPublicId() });
        const fullTicket = await this.tickets.findTicket(ticket.id);
        void this.dispatchTicketEmail(input.emailEvent, fullTicket ?? ticket, { ticket_content: input.body }).catch(() => undefined);
        return ticket;
      } catch (error) {
        if (!isUniqueCollision(error) || attempt === 7) {
          throw error;
        }
      }
    }
    throw new BadRequestException("Could not create ticket id.");
  }

  // ── Reads ─────────────────────────────────────────────────────────────────────

  async listTickets(actor: TicketActor, filters: { status?: string; departmentId?: string } = {}) {
    if (hasFullAccess(actor.roles)) {
      return this.tickets.listTickets({ ...filters });
    }
    if (isStaff(actor.roles)) {
      const departmentIds = await this.tickets.memberDepartmentIds(actor.id);
      if (departmentIds.length === 0) {
        return [];
      }
      const scoped = filters.departmentId && departmentIds.includes(filters.departmentId) ? [filters.departmentId] : departmentIds;
      return this.tickets.listTickets({ status: filters.status, departmentIds: scoped });
    }
    return this.tickets.listTickets({ status: filters.status, userId: actor.id });
  }

  async getTicket(id: string, actor: TicketActor) {
    const ticket = await this.tickets.findTicket(id);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    await this.assertAccess(ticket, actor);
    return ticket;
  }

  listCannedReplies(departmentId?: string) {
    return this.tickets.listCannedReplies(departmentId);
  }

  listActiveDepartments() {
    return this.departments.listActive();
  }

  // ── Replies / status / attachments ─────────────────────────────────────────────

  async createReply(ticketId: string, actor: TicketActor, dto: CreateReplyDto) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    const staff = await this.assertAccess(ticket, actor);

    if (dto.internal) {
      if (!staff) {
        throw new BadRequestException("Internal notes are staff only.");
      }
      return this.tickets.createInternalNote({ ticketId, staffId: actor.id, body: dto.body });
    }

    const reply = await this.tickets.createReply({ ticketId, userId: actor.id, body: dto.body, internal: false });
    await this.tickets.touchTicket(ticket.id, staff ? "ANSWERED" : "CUSTOMER_REPLY");
    void this.dispatchTicketEmail("ticket_answered", ticket, {
      ticket_reply: dto.body,
      staff_name: staff ? stringValue(reply.user?.name) : undefined
    }).catch(() => undefined);
    return reply;
  }

  // Posts a styled system message linking a newly-created invoice into the thread.
  async createInvoiceMessage(ticketId: string, actor: TicketActor, invoiceId: string) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    const staff = await this.assertAccess(ticket, actor);
    if (!staff) {
      throw new ForbiddenException("Only staff can attach invoices.");
    }
    const invoice = await this.tickets.findInvoiceForUser(invoiceId, ticket.userId);
    if (!invoice) {
      throw new BadRequestException("Invoice not found for this ticket's client.");
    }
    const reply = await this.tickets.createReply({
      ticketId,
      userId: actor.id,
      body: `A new invoice has been created for you.`,
      internal: false,
      system: true,
      invoiceId
    });
    await this.tickets.touchTicket(ticket.id, "ANSWERED");
    return reply;
  }

  async updateStatus(ticketId: string, status: string) {
    if (!isTicketStatus(status)) {
      throw new BadRequestException("Invalid ticket status.");
    }
    const ticket = await this.tickets.updateStatus(ticketId, status);
    if (status === "CLOSED") {
      const fullTicket = await this.tickets.findTicket(ticketId);
      void this.dispatchTicketEmail("ticket_closed", fullTicket ?? ticket).catch(() => undefined);
    }
    return ticket;
  }

  assignTicket(ticketId: string, staffId: string) {
    return this.tickets.assignTicket(ticketId, staffId);
  }

  async closeTicket(ticketId: string, actor: TicketActor) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    await this.assertAccess(ticket, actor);
    const closed = await this.tickets.updateStatus(ticket.id, "CLOSED");
    void this.dispatchTicketEmail("ticket_closed", ticket).catch(() => undefined);
    return closed;
  }

  async attachFiles(ticketId: string, actor: TicketActor, files?: UploadedTicketFile[], replyId?: string) {
    const ticket = await this.tickets.findTicket(ticketId);
    if (!ticket) {
      throw new NotFoundException("Ticket not found");
    }
    await this.assertAccess(ticket, actor);

    if (replyId) {
      const reply = await this.tickets.findReply(replyId);
      if (!reply || reply.ticketId !== ticket.id) {
        throw new BadRequestException("Reply does not belong to this ticket.");
      }
    }

    const stored = await storeTicketFiles(files);
    return this.tickets.createAttachments(stored.map((file) => ({ ...file, replyId, ticketId: ticket.id })));
  }

  // Cron: close tickets that have stayed ANSWERED (awaiting the client) past the
  // window, and email each client that their ticket was closed. Done per-ticket
  // (sequentially) rather than a bulk update so the close email fires for each.
  async closeAnsweredTickets(closeAfterHours: number, now = new Date()) {
    const cutoff = new Date(now.getTime() - closeAfterHours * 60 * 60 * 1000);
    const stale = await this.tickets.findAnsweredOlderThan(cutoff);
    let closed = 0;
    for (const ticket of stale) {
      await this.tickets.updateStatus(ticket.id, "CLOSED");
      closed += 1;
      try {
        await this.dispatchTicketEmail("ticket_closed", { ...ticket, status: "CLOSED" });
      } catch {
        // A single email failure must not abort the rest of the sweep.
      }
    }
    return { closed };
  }

  // ── Permissions ────────────────────────────────────────────────────────────────

  // Returns whether the actor is staff. Throws NotFound when they may not see it.
  private async assertAccess(ticket: { userId: string; departmentId: string }, actor: TicketActor): Promise<boolean> {
    if (hasFullAccess(actor.roles)) {
      return true;
    }
    if (isStaff(actor.roles)) {
      const departmentIds = await this.tickets.memberDepartmentIds(actor.id);
      if (!departmentIds.includes(ticket.departmentId)) {
        throw new NotFoundException("Ticket not found");
      }
      return true;
    }
    if (ticket.userId !== actor.id) {
      throw new NotFoundException("Ticket not found");
    }
    return false;
  }

  private async requireDepartmentId(departmentId: string) {
    const department = await this.tickets.departmentExists(departmentId);
    if (!department) {
      throw new BadRequestException("Unknown department.");
    }
    return department.id;
  }

  private async resolveRoutedDepartmentId(key: "contactFormDepartmentId" | "inquiryFormDepartmentId") {
    const configured = await this.departments.getRoutingDepartmentId(key);
    if (configured) {
      const exists = await this.tickets.departmentExists(configured);
      if (exists) {
        return exists.id;
      }
    }
    const fallback = await this.departments.defaultDepartment();
    if (!fallback) {
      throw new BadRequestException("No department configured to receive this form.");
    }
    return fallback.id;
  }

  // ── IMAP import ─────────────────────────────────────────────────────────────────

  async importMailboxTickets(settings: Record<string, unknown>) {
    let fetched = 0;
    let imported = 0;
    let skipped = 0;
    const byDepartment: Record<string, number> = {};
    const mailboxes: Array<{
      address: string;
      department?: string;
      enabled: boolean;
      fetched?: number;
      imported?: number;
      skipped?: number;
      error?: string;
    }> = [];

    for (const mailbox of mailboxConfigs(settings)) {
      if (!mailbox.enabled) {
        mailboxes.push({ address: mailbox.address, department: mailbox.department, enabled: false });
        continue;
      }
      if (!mailbox.host || !mailbox.username || !mailbox.password) {
        mailboxes.push({ address: mailbox.address, department: mailbox.department, enabled: true, error: "Missing IMAP host, username or password" });
        continue;
      }

      let messages: ImapMessage[];
      try {
        messages = await fetchUnreadImapMessages(mailbox);
      } catch (error) {
        mailboxes.push({
          address: mailbox.address,
          enabled: true,
          error: error instanceof Error ? error.message : "IMAP fetch failed"
        });
        continue;
      }

      let boxImported = 0;
      let boxSkipped = 0;
      for (const message of messages) {
        fetched += 1;
        const sender = message.from?.toLowerCase();
        if (!sender) {
          skipped += 1;
          boxSkipped += 1;
          await this.logInbound(mailbox, message, undefined, "SKIPPED_NO_SENDER");
          continue;
        }

        const departmentSlug = departmentSlugFor(message.to, mailbox);
        const departmentId = await this.departmentIdForSlug(departmentSlug);
        if (!departmentId) {
          skipped += 1;
          boxSkipped += 1;
          await this.logInbound(mailbox, message, undefined, "SKIPPED_NO_DEPARTMENT");
          continue;
        }
        const user = (await this.tickets.findUserByEmail(sender)) ?? (await this.tickets.findOrCreateGuestUser(sender, sender));
        let ticketId: string | undefined;
        try {
          const ticket = await this.persistTicket({
            ownerId: user.id,
            authorId: user.id,
            departmentId,
            body: message.body || "(empty email)",
            priority: "NORMAL",
            status: "OPEN",
            subject: message.subject || `Email from ${sender}`,
            emailEvent: "ticket_opened"
          });
          ticketId = ticket?.id;
          imported += 1;
          boxImported += 1;
          byDepartment[departmentSlug] = (byDepartment[departmentSlug] ?? 0) + 1;
        } catch {
          skipped += 1;
          boxSkipped += 1;
        }
        await this.logInbound(mailbox, message, user.id, ticketId ? "RECEIVED" : "FAILED", ticketId);
      }

      mailboxes.push({
        address: mailbox.address,
        department: mailbox.department,
        enabled: true,
        fetched: messages.length,
        imported: boxImported,
        skipped: boxSkipped
      });
    }

    return { byDepartment, fetched, imported, mailboxes, skipped };
  }

  private async departmentIdForSlug(slug: string) {
    const department = (await this.departments.findBySlug(slug)) ?? (await this.departments.defaultDepartment());
    return department?.id;
  }

  private async logInbound(
    mailbox: ImapMailboxConfig,
    message: ImapMessage,
    userId: string | undefined,
    status: string,
    ticketId?: string
  ) {
    if (!this.emails) {
      return;
    }
    await this.emails
      .logInboundEmail({
        body: message.body,
        department: mailbox.department,
        from: message.from,
        status,
        subject: message.subject,
        ticketId,
        to: mailbox.address,
        userId
      })
      .catch(() => undefined);
  }

  private async dispatchTicketEmail(eventKey: string, ticket: Record<string, any> | null | undefined, extra: Record<string, unknown> = {}) {
    if (!this.emails || !ticket) {
      return [];
    }
    const user = isRecord(ticket.user) ? ticket.user : {};
    const department = isRecord(ticket.department) ? ticket.department : {};
    const assignee = isRecord(ticket.assignee) ? ticket.assignee : {};
    const firstReply = Array.isArray(ticket.replies) ? ticket.replies.find((reply) => !reply.internal) : undefined;
    const ticketId = ticket.publicId ?? ticket.id;
    return this.emails.dispatch(eventKey, {
      context: {
        customer_email: stringValue(user.email),
        customer_name: stringValue(user.name) ?? stringValue(user.email),
        department_name: stringValue(department.name),
        staff_name: stringValue(extra.staff_name) ?? stringValue(assignee.name),
        ticket_content: stringValue(extra.ticket_content) ?? stringValue(firstReply?.body),
        ticket_id: ticketId,
        ticket_reply: stringValue(extra.ticket_reply),
        ticket_status: ticketStatusLabel(ticket.status),
        ticket_subject: ticket.subject,
        ticket_url: tenantClientUrl(`/tickets/${ticket.id}`),
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
const TICKET_STATUSES = ["OPEN", "ANSWERED", "CUSTOMER_REPLY", "CLOSED"];

export function generateTicketPublicId() {
  let id = "";
  for (let index = 0; index < 8; index += 1) {
    id += TICKET_ID_ALPHABET[randomInt(TICKET_ID_ALPHABET.length)];
  }
  return id;
}

function hasFullAccess(roles: string[] = []) {
  return roles.some((role) => FULL_ACCESS_ROLES.includes(role));
}

function isStaff(roles: string[] = []) {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

function isTicketStatus(value: string) {
  return TICKET_STATUSES.includes(value);
}

// Friendly ticket status for emails so clients never see ALL_CAPS_WITH_UNDERSCORES.
function ticketStatusLabel(status: unknown) {
  const labels: Record<string, string> = {
    OPEN: "Open",
    ANSWERED: "Answered",
    CUSTOMER_REPLY: "Customer reply",
    CLOSED: "Closed"
  };
  const value = String(status ?? "");
  return labels[value] ?? value.toLowerCase().replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());
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

function mailboxConfigs(settings: Record<string, unknown>): ImapMailboxConfig[] {
  return [
    {
      address: stringValue(settings.supportMailboxAddress) ?? "support@teculiar.com",
      department: "support",
      enabled: Boolean(settings.supportImapEnabled),
      host: stringValue(settings.supportImapHost),
      mailbox: stringValue(settings.supportImapMailbox) ?? "INBOX",
      password: stringValue(settings.supportImapPassword),
      port: numberValue(settings.supportImapPort, 993),
      secure: settings.supportImapSecure !== false,
      username: stringValue(settings.supportImapUsername)
    },
    {
      address: stringValue(settings.salesMailboxAddress) ?? "sales@dezhost.com",
      department: "sales",
      enabled: Boolean(settings.salesImapEnabled),
      host: stringValue(settings.salesImapHost),
      mailbox: stringValue(settings.salesImapMailbox) ?? "INBOX",
      password: stringValue(settings.salesImapPassword),
      port: numberValue(settings.salesImapPort, 993),
      secure: settings.salesImapSecure !== false,
      username: stringValue(settings.salesImapUsername)
    }
  ];
}

function departmentSlugFor(to: string | undefined, fallback: ImapMailboxConfig) {
  const recipients = String(to ?? "").toLowerCase();
  if (recipients.includes("sales@dezhost.com")) {
    return "sales";
  }
  if (recipients.includes("support@dezhost.com")) {
    return "support";
  }
  return fallback.department;
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
