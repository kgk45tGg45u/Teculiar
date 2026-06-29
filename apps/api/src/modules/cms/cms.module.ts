import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AiBlogService } from "./ai-blog.service";
import { CmsController } from "./cms.controller";
import { CmsRepository } from "./cms.repository";
import { CmsService } from "./cms.service";
import { TranslationService } from "./translation.service";

@Module({
  imports: [BillingModule],
  controllers: [CmsController],
  providers: [CmsService, CmsRepository, TranslationService, AiBlogService],
  exports: [CmsService, AiBlogService]
})
export class CmsModule {}
