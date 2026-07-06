import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { EmailModule } from "../email/email.module";
import { UsersModule } from "../users/users.module";
import { ControlPlaneService } from "../../tenancy/control-plane.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard, OptionalJwtAuthGuard } from "./guards/jwt-auth.guard";

@Module({
  imports: [EmailModule, JwtModule.register({ global: true }), UsersModule],
  controllers: [AuthController],
  // ControlPlaneService is stateless-lazy (env-gated), so providing it here (in addition to
  // TenancyModule) avoids a module cycle; it's used to validate SSO handoff target origins.
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, ControlPlaneService],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard]
})
export class AuthModule {}
