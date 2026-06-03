import { Injectable } from "@nestjs/common";
import { hash } from "bcryptjs";
import { EmailService } from "../email/email.service";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly emails?: EmailService
  ) {}

  async getMe(userId: string) {
    const user = await this.users.findById(userId);
    return user ? publicUser(user) : null;
  }

  listClients() {
    return this.users.listClients();
  }

  getClient(userId: string) {
    return this.users.findClient(userId);
  }

  async createClient(input: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email: string;
    name: string;
    password: string;
    phone?: string;
    vatId?: string;
  }) {
    const client = await this.users.createClient({
      ...input,
      passwordHash: await hash(input.password, 12)
    });
    void this.emails?.dispatch("welcome", {
      context: { customer_email: client.email, customer_name: client.name },
      user: { email: client.email, id: client.id, name: client.name }
    }).catch(() => undefined);
    return client;
  }

  updateClient(userId: string, input: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
    name?: string;
    phone?: string;
    segment?: string;
    vatId?: string;
  }) {
    return this.users.updateClient(userId, input);
  }

  deleteClient(userId: string) {
    return this.users.deleteClient(userId);
  }

  updateSegment(userId: string, segment: string) {
    return this.users.updateSegment(userId, segment);
  }

  listAdminUsers() {
    return this.users.listAdminUsers();
  }

  createAdminUser(input: { email: string; name: string; passwordHash: string; roleSlug: string }) {
    return this.users.createAdminUser(input);
  }

  updateAdminUserRole(userId: string, roleSlug: string) {
    return this.users.updateAdminUserRole(userId, roleSlug);
  }

  updateAdminUserPassword(userId: string, passwordHash: string) {
    return this.users.updateAdminUserPassword(userId, passwordHash);
  }

  deleteAdminUser(userId: string) {
    return this.users.deleteAdminUser(userId);
  }

  async updateProfile(userId: string, input: {
    address?: Record<string, unknown>;
    countryCode?: string;
    customerType?: "INDIVIDUAL" | "BUSINESS";
    email?: string;
    name?: string;
    phone?: string;
    vatId?: string;
  }) {
    const user = await this.users.updateProfile(userId, input);
    return user ? publicUser(user) : null;
  }

  exportAccount(userId: string) {
    return {
      requestedAt: new Date().toISOString(),
      userId,
      status: "QUEUED"
    };
  }

  requestDeletion(userId: string) {
    return {
      requestedAt: new Date().toISOString(),
      userId,
      status: "PENDING_VERIFICATION"
    };
  }
}

function publicUser(user: {
  contacts?: Array<{ address?: unknown; phone?: string | null }>;
  countryCode?: string;
  customerNumber?: number;
  customerType?: string;
  email: string;
  id: string;
  name: string;
  balanceCents?: number;
  userRoles?: Array<{ role: { slug: string } }>;
  vatId?: string | null;
}) {
  const contact = user.contacts?.[0];
  return {
    address: contact?.address,
    countryCode: user.countryCode,
    customerNumber: user.customerNumber,
    customerType: user.customerType,
    email: user.email,
    id: user.id,
    name: user.name,
    balanceCents: user.balanceCents ?? 0,
    phone: contact?.phone,
    vatId: user.vatId,
    roles: user.userRoles?.map((userRole) => userRole.role.slug) ?? []
  };
}
