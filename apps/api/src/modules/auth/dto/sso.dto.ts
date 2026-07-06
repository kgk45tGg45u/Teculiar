import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SsoExchangeDto {
  /** Full origin (or URL) of the destination, e.g. https://client.acmehost.com */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  targetOrigin!: string;

  /** base64url(sha256(codeVerifier)) — PKCE-style binding. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  codeChallenge!: string;
}

export class SsoRedeemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  codeVerifier!: string;
}
