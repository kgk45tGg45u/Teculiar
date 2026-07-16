import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../modules/prisma/prisma.service";

// Trail of what the read-only "agent" role looked at (see AgentWriteBlockGuard, pii-mask.ts).
// Fire-and-forget: a logging failure must never block a masked read from returning.
@Injectable()
export class AgentAuditService {
  constructor(private readonly prisma: PrismaService) {}

  recordRead(actorId: string, subject: string, subjectId?: string): void {
    void this.prisma.auditLog
      .create({
        data: { action: "agent.read", actorId, subject, subjectId, metadata: {} as Prisma.InputJsonValue }
      })
      .catch(() => undefined);
  }
}
