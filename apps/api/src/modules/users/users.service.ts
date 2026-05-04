import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  getMe(userId: string) {
    return this.users.findById(userId);
  }

  listClients() {
    return this.users.listClients();
  }

  updateSegment(userId: string, segment: string) {
    return this.users.updateSegment(userId, segment);
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
