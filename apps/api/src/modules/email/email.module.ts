import { Module } from "@nestjs/common";
import { EmailAdminController } from "./email.controller";
import { EmailService } from "./email.service";

@Module({
  controllers: [EmailAdminController],
  providers: [EmailService],
  exports: [EmailService]
})
export class EmailModule {}
