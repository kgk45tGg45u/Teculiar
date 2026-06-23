import { Module } from "@nestjs/common";
import { ThemeAdminController, ThemeStorefrontController } from "./theme.controller";
import { ThemeRepository } from "./theme.repository";
import { ThemeService } from "./theme.service";

@Module({
  controllers: [ThemeStorefrontController, ThemeAdminController],
  providers: [ThemeService, ThemeRepository],
  exports: [ThemeService, ThemeRepository]
})
export class ThemeModule {}
