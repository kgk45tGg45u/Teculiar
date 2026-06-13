import { Module } from "@nestjs/common";
import { DepartmentsModule } from "../departments/departments.module";
import { EmailModule } from "../email/email.module";
import { StorefrontInquiriesController, TicketsController, TicketsDevController } from "./tickets.controller";
import { TicketsRepository } from "./tickets.repository";
import { TicketsService } from "./tickets.service";

@Module({
  imports: [EmailModule, DepartmentsModule],
  controllers: [TicketsController, TicketsDevController, StorefrontInquiriesController],
  providers: [TicketsService, TicketsRepository],
  exports: [TicketsService]
})
export class TicketsModule {}
