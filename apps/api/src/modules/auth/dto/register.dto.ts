import { IsEmail, IsIn, IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(12)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  vatId?: string;

  @IsOptional()
  @IsObject()
  address?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsIn(["INDIVIDUAL", "BUSINESS"])
  customerType?: "INDIVIDUAL" | "BUSINESS";
}
