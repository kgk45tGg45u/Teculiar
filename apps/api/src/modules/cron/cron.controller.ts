import { Controller, Get, Headers, Post, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CronService } from "./cron.service";

@Controller("cron")
export class CronController {
  constructor(private readonly cron: CronService) {}

  @Get()
  runGet(@Headers("authorization") authorization?: string, @Headers("x-cron-secret") headerSecret?: string, @Query("token") querySecret?: string) {
    return this.cron.runAuthorized(secretFrom(authorization, headerSecret, querySecret));
  }

  @Post()
  runPost(@Headers("authorization") authorization?: string, @Headers("x-cron-secret") headerSecret?: string, @Query("token") querySecret?: string) {
    return this.cron.runAuthorized(secretFrom(authorization, headerSecret, querySecret));
  }

  // "agent" deliberately excluded: this runs the real cron sweep (billing renewals/invoicing,
  // auto-closing tickets) — real customer-facing side effects, not something a read-only test
  // credential should ever trigger.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "staff", "super_admin")
  @Post("admin/run")
  runAdmin() {
    return this.cron.run();
  }
}

function secretFrom(authorization?: string, headerSecret?: string, querySecret?: string) {
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return headerSecret ?? bearer ?? querySecret;
}
