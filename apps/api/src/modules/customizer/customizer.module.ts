import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { CmsModule } from "../cms/cms.module";
import { CustomizerAdminController, CustomizerStorefrontController } from "./customizer.controller";
import { CustomizerService } from "./customizer.service";

// Reuses BillingService (i18nLanguages + DeepSeek key) and AiBlogService (callDeepseek) for the
// per-field auto-translate; PrismaService is global.
@Module({
  imports: [BillingModule, CmsModule],
  controllers: [CustomizerAdminController, CustomizerStorefrontController],
  providers: [CustomizerService],
  exports: [CustomizerService]
})
export class CustomizerModule {}
