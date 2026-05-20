import { Controller, Get, Headers, Post, Query } from "@nestjs/common";
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
}

function secretFrom(authorization?: string, headerSecret?: string, querySecret?: string) {
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return headerSecret ?? bearer ?? querySecret;
}
