import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async getMe(userId: string) {
    const user = await this.users.findById(userId);
    return user ? publicUser(user) : null;
  }

  listClients() {
    return this.users.listClients();
  }

  updateSegment(userId: string, segment: string) {
    return this.users.updateSegment(userId, segment);
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
  customerType?: string;
  email: string;
  id: string;
  name: string;
  userRoles?: Array<{ role: { slug: string } }>;
  vatId?: string | null;
}) {
  const contact = user.contacts?.[0];
  return {
    address: contact?.address,
    countryCode: user.countryCode,
    customerType: user.customerType,
    email: user.email,
    id: user.id,
    name: user.name,
    phone: contact?.phone,
    vatId: user.vatId,
    roles: user.userRoles?.map((userRole) => userRole.role.slug) ?? []
  };
}
