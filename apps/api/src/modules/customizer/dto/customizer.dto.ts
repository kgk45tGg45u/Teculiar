import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

// The layout doc is a versioned JSON tree (validated structurally in the service / by the renderer,
// which tolerates unknown node types). DTOs only assert the coarse frame here.
export class SaveDraftDto {
  @IsObject()
  layout!: Record<string, unknown>;
}

export class PublishDto {
  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>; // omit → publish the current server draft

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}

// Per-field auto-translate: translate each string in `texts` from `source` (default: main language)
// into `target`. Returns the translated array in the same order.
export class TranslateDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  texts!: string[];

  @IsString()
  @MaxLength(10)
  target!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  source?: string;
}
