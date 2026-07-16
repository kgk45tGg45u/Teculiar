import { Module } from "@nestjs/common";
import { AgentAuditService } from "../../common/agent-audit.service";
import { EmailModule } from "../email/email.module";
import { AdminManagementController, UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";

@Module({
  imports: [EmailModule],
  controllers: [UsersController, AdminManagementController],
  providers: [UsersService, UsersRepository, AgentAuditService],
  exports: [UsersService, UsersRepository]
})
export class UsersModule {}
