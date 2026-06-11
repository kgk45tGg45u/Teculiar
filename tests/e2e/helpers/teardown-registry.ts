/**
 * Persistent record of Virtualmin hosting accounts the suite created, so they
 * can be removed even if a test crashes mid-way. Per-test fixtures delete eagerly
 * (afterEach); global-teardown sweeps anything left behind from this file.
 *
 * File-locked-free by design: appends are serialised through a small in-process
 * queue and writes are last-wins; the global sweep reconciles the final state.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../config/env";

const filePath = resolve(process.cwd(), env.artifacts.createdHostingFile);
const logPath = filePath.replace(/\.json$/, ".log");

function ensureDir(): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Record a domain whose Virtualmin account must be torn down. */
export function recordCreatedHostingDomain(domain: string): void {
  if (!domain) return;
  ensureDir();
  // Append-only log: crash-safe and parallel-safe (no read-modify-write race).
  appendFileSync(logPath, `${domain}\n`, "utf8");
}

/** All domains recorded this run (deduplicated). */
export function listCreatedHostingDomains(): string[] {
  const domains = new Set<string>();
  if (existsSync(logPath)) {
    for (const line of readFileSync(logPath, "utf8").split("\n")) {
      const d = line.trim();
      if (d) domains.add(d);
    }
  }
  if (existsSync(filePath)) {
    try {
      for (const d of JSON.parse(readFileSync(filePath, "utf8")) as string[]) domains.add(d);
    } catch {
      /* ignore corrupt snapshot */
    }
  }
  return [...domains];
}

/** Reset the registry (used by global-setup at the start of a fresh run). */
export function resetRegistry(): void {
  ensureDir();
  writeFileSync(filePath, "[]", "utf8");
  writeFileSync(logPath, "", "utf8");
}

/** Persist the deduplicated snapshot (used after a sweep). */
export function snapshotRegistry(domains: string[]): void {
  ensureDir();
  writeFileSync(filePath, JSON.stringify([...new Set(domains)], null, 2), "utf8");
}
