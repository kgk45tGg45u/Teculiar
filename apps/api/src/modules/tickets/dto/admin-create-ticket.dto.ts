import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

// Admin-initiated ticket: pick an existing client/guest by `userId`, OR start a
// fresh conversation with someone who is not a client by passing `name` + `email`
// (a guest contact is created for them).
export class AdminCreateTicketDto {
  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsString()
  departmentId: string;

  @IsOptional()
  @IsIn(["LOW", "NORMAL", "HIGH", "URGENT"])
  priority?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
}
