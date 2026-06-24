import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateRedirectDto, UpdateRedirectDto } from "./dto/redirects.dto";
import { RedirectsRepository } from "./redirects.repository";

@Injectable()
export class RedirectsService {
  constructor(private readonly repo: RedirectsRepository) {}

  /** Public, minimal shape the storefront middleware consults (enabled rows only). */
  async storefrontRedirects() {
    const rows = await this.repo.enabled();
    return rows.map((r) => ({ from: r.fromPath, to: r.toPath, permanent: r.permanent }));
  }

  /** Full list for the admin Redirects tab. */
  list() {
    return this.repo.list();
  }

  async create(dto: CreateRedirectDto) {
    const fromPath = normalizeFrom(dto.fromPath);
    const toPath = normalizeTo(dto.toPath);
    this.assertNotLoop(fromPath, toPath);
    if (await this.repo.byFromPath(fromPath)) {
      throw new ConflictException(`A redirect from "${fromPath}" already exists.`);
    }
    return this.repo.create({
      fromPath,
      toPath,
      permanent: dto.permanent ?? true,
      enabled: dto.enabled ?? true
    });
  }

  async update(id: string, dto: UpdateRedirectDto) {
    const existing = await this.repo.byId(id);
    if (!existing) {
      throw new NotFoundException("Redirect not found");
    }
    const fromPath = dto.fromPath !== undefined ? normalizeFrom(dto.fromPath) : existing.fromPath;
    const toPath = dto.toPath !== undefined ? normalizeTo(dto.toPath) : existing.toPath;
    this.assertNotLoop(fromPath, toPath);
    if (fromPath !== existing.fromPath) {
      const clash = await this.repo.byFromPath(fromPath);
      if (clash && clash.id !== id) {
        throw new ConflictException(`A redirect from "${fromPath}" already exists.`);
      }
    }
    return this.repo.update(id, {
      fromPath,
      toPath,
      ...(dto.permanent !== undefined ? { permanent: dto.permanent } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {})
    });
  }

  async delete(id: string) {
    const existing = await this.repo.byId(id);
    if (!existing) {
      throw new NotFoundException("Redirect not found");
    }
    await this.repo.delete(id);
    return { ok: true };
  }

  private assertNotLoop(fromPath: string, toPath: string) {
    if (fromPath === toPath) {
      throw new BadRequestException("A redirect can't point to itself.");
    }
  }
}

// Source path: always an absolute site path, lowercased host-style not needed — we match the raw
// request pathname, so require a leading slash and strip any trailing slash (except root).
function normalizeFrom(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    throw new BadRequestException('The "from" path must start with "/".');
  }
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

// Destination: an internal path ("/…") or an absolute URL ("http(s)://…").
function normalizeTo(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException('The "to" path is required.');
  }
  if (!trimmed.startsWith("/") && !/^https?:\/\//i.test(trimmed)) {
    throw new BadRequestException('The "to" path must start with "/" or be an absolute http(s) URL.');
  }
  return trimmed;
}
