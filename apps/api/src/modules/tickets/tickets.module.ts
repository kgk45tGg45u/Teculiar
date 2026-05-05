import { Module } from "@nestjs/common";
import { TicketsController, TicketsDevController } from "./tickets.controller";
import { TicketsRepository } from "./tickets.repository";
import { TicketsService } from "./tickets.service";

@Module({
  controllers: [TicketsController, TicketsDevController],
  providers: [TicketsService, TicketsRepository],
  exports: [TicketsService]
})
export class TicketsModule {}
