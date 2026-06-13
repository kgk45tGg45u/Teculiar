import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException } from "@nestjs/common";

// Shared local-disk file storage for user uploads (ticket attachments, staff
// avatars, …). Files land under apps/web/public/uploads/<subdir> so Next.js
// serves them statically at /uploads/<subdir>/<file>.

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

function uploadsDir(subdir: string) {
  return process.cwd().endsWith("apps/api")
    ? resolve(process.cwd(), "../web/public/uploads", subdir)
    : resolve(process.cwd(), "apps/web/public/uploads", subdir);
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
  const dir = uploadsDir(opts.subdir);
  await mkdir(dir, { recursive: true });

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
      storageKey: `/uploads/${opts.subdir}/${fileName}`
    });
  }
  return stored;
}
