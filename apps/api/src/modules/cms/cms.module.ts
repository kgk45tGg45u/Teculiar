import { Module } from "@nestjs/common";
import { CmsController } from "./cms.controller";
import { CmsRepository } from "./cms.repository";
import { CmsService } from "./cms.service";
import { TranslationService } from "./translation.service";

@Module({
  controllers: [CmsController],
  providers: [CmsService, CmsRepository, TranslationService],
  exports: [CmsService]
})
export class CmsModule {}
