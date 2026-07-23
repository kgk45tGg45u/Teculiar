import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { getTenantContext } from "../tenancy/tenant-context";

// Shared local-disk file storage for user uploads (ticket attachments, staff
// avatars, …). Phase 8.2: files land tenant-scoped under
// apps/web/public/uploads/<tenant>/<subdir> so tenants never share an uploads
// namespace; served at /uploads/<tenant>/<subdir>/<file> and authorized per tenant
// by uploads-guard.ts. In single-tenant fallback (no resolved tenant) the legacy
// flat apps/web/public/uploads/<subdir> layout is kept.

export type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

export type StoredFile = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

export const DOC_TYPES: Record<string, string> = {
  "application/pdf": ".pdf"
};

function uploadsRoot() {
  return process.cwd().endsWith("apps/api")
    ? resolve(process.cwd(), "../web/public/uploads")
    : resolve(process.cwd(), "apps/web/public/uploads");
}

/** The active request's tenant subdomain, sanitized for a path segment — null in single-tenant fallback. */
export function tenantScope(): string | null {
  const subdomain = getTenantContext()?.tenant?.subdomain;
  if (!subdomain) {
    return null;
  }
  const safe = subdomain.toLowerCase().replace(/[^a-z0-9-]+/g, "");
  return safe.length > 0 ? safe : null;
}

function uploadsDir(subdir: string, scope: string | null) {
  const root = uploadsRoot();
  return scope ? resolve(root, scope, subdir) : resolve(root, subdir);
}

export function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "upload";
}

export async function storeUploadedFiles(
  files: UploadedFile[] | undefined,
  opts: { subdir: string; maxFiles?: number; maxBytes?: number; allow?: Record<string, string> }
): Promise<StoredFile[]> {
  const uploads = files ?? [];
  if (uploads.length === 0) {
    return [];
  }
  const maxFiles = opts.maxFiles ?? 5;
  if (uploads.length > maxFiles) {
    throw new BadRequestException(`Maximum ${maxFiles} file${maxFiles === 1 ? "" : "s"} per upload.`);
  }
  const allow = opts.allow ?? { ...IMAGE_TYPES, ...DOC_TYPES };
  const maxBytes = opts.maxBytes ?? 10_000_000;
  const scope = tenantScope();
  const dir = uploadsDir(opts.subdir, scope);
  await mkdir(dir, { recursive: true });
  const prefix = scope ? `/uploads/${scope}/${opts.subdir}` : `/uploads/${opts.subdir}`;

  const stored: StoredFile[] = [];
  for (const file of uploads) {
    if (file.size > maxBytes) {
      throw new BadRequestException(`Files must be smaller than ${Math.round(maxBytes / 1_000_000)} MB.`);
    }
    const extension = allow[file.mimetype];
    if (!extension) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(dir, fileName), file.buffer);
    stored.push({
      fileName: sanitizeFileName(file.originalname ?? `upload${extension}`),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey: `${prefix}/${fileName}`
    });
  }
  return stored;
}
