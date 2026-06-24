import { Module } from "@nestjs/common";
import { RedirectsAdminController, RedirectsStorefrontController } from "./redirects.controller";
import { RedirectsRepository } from "./redirects.repository";
import { RedirectsService } from "./redirects.service";

@Module({
  controllers: [RedirectsStorefrontController, RedirectsAdminController],
  providers: [RedirectsService, RedirectsRepository],
  exports: [RedirectsService]
})
export class RedirectsModule {}
