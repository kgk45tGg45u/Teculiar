import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BadRequestException } from "@nestjs/common";

export type UploadedTicketFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
};

export type StoredTicketFile = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

export async function storeTicketFiles(files?: UploadedTicketFile[]) {
  const uploads = files ?? [];
  if (uploads.length === 0) {
    return [];
  }
  if (uploads.length > 5) {
    throw new BadRequestException("Maximum 5 files per upload.");
  }

  const dir = await ticketUploadsDir();
  const stored: StoredTicketFile[] = [];
  for (const file of uploads) {
    if (file.size > 10_000_000) {
      throw new BadRequestException("Ticket files must be smaller than 10 MB.");
    }
    const extension = extensionFor(file.mimetype);
    if (!extension) {
      throw new BadRequestException("Only PNG, JPG, WebP, and PDF files are allowed.");
    }

    const safeName = sanitizeFileName(file.originalname ?? `attachment${extension}`);
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    await writeFile(join(dir, fileName), file.buffer);
    stored.push({
      fileName: safeName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storageKey: `/uploads/tickets/${fileName}`
    });
  }
  return stored;
}

function extensionFor(mimetype: string) {
  return {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
  }[mimetype];
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "attachment";
}

async function ticketUploadsDir() {
  const dir = process.cwd().endsWith("apps/api")
    ? resolve(process.cwd(), "../web/public/uploads/tickets")
    : resolve(process.cwd(), "apps/web/public/uploads/tickets");
  await mkdir(dir, { recursive: true });
  return dir;
}
