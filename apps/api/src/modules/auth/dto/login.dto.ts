import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  totpCode?: string;

  // Which portal is logging in. Admin and client are separate credential worlds;
  // omitted = "client" (storefront checkout, client portal).
  @IsOptional()
  @IsIn(["admin", "client"])
  scope?: "admin" | "client";
}
