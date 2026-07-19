import { BadRequestException } from "@nestjs/common";

export function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

export function requiredConfig(config: Record<string, unknown>, key: string, message: string) {
  const value = stringConfig(config, key);
  if (!value) {
    throw new BadRequestException(message);
  }
  return value;
}

export function stringConfig(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function gatewayMessage(payload: unknown, fallback: string) {
  if (!isRecord(payload)) {
    return fallback;
  }
  const detail = payload.detail ?? payload.message ?? payload.error_description ?? payload.error;
  return typeof detail === "string" && detail ? detail : fallback;
}

export function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
