/**
 * Cross-worker provisioning gate for SHARED_HOSTING orders.
 *
 * WHY: paying several hosting orders at once makes Virtualmin run concurrent
 * `create-domain` operations that race on the shared Apache config and corrupt the
 * server. This gate guarantees, across ALL parallel Playwright workers:
 *   1. mutual exclusion — only one hosting payment is in flight at a time, and
 *   2. spacing — at least `hostingGapMs` between consecutive hosting payments,
 *   3. settle — the lock is held briefly after payment so the server-side
 *      create-domain gets a head start before the next one begins.
 *
 * Coordination is via an atomic lock directory + a last-provision timestamp file
 * on disk, so it works without any shared process state. Non-hosting flows
 * (VPS / domain-only) don't use the gate and stay fully parallel.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../config/env";

const root = resolve(process.cwd(), "tests/e2e/results");
const lockDir = resolve(root, ".hosting-provision.lock");
const ownerFile = resolve(lockDir, "owner");
const tsFile = resolve(root, ".hosting-provision-last");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ensureRoot(): void {
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
}

function tryAcquire(): boolean {
  ensureRoot();
  try {
    mkdirSync(lockDir); // atomic: throws if it already exists
    writeFileSync(ownerFile, `${process.pid}:${Date.now()}`, "utf8");
    return true;
  } catch {
    // Steal a stale lock left by a crashed worker.
    try {
      const ts = Number(readFileSync(ownerFile, "utf8").split(":")[1] ?? "0");
      if (Date.now() - ts > env.provision.lockStaleMs) {
        rmSync(lockDir, { recursive: true, force: true });
      }
    } catch {
      /* lock vanished between checks — fine, retry */
    }
    return false;
  }
}

async function acquireBlocking(): Promise<void> {
  while (!tryAcquire()) await sleep(500 + Math.floor(Math.random() * 400));
}

function release(): void {
  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* already released */
  }
}

function readLast(): number {
  try {
    return Number(readFileSync(tsFile, "utf8")) || 0;
  } catch {
    return 0;
  }
}

function writeLast(value: number): void {
  ensureRoot();
  writeFileSync(tsFile, String(value), "utf8");
}

/**
 * Run a hosting payment under the gate. Enforces spacing since the last hosting
 * payment, runs `fn`, holds briefly so provisioning starts, then releases.
 */
export async function withHostingProvisionGate<T>(fn: () => Promise<T>): Promise<T> {
  await acquireBlocking();
  try {
    const since = Date.now() - readLast();
    const wait = env.provision.hostingGapMs - since;
    if (wait > 0) await sleep(wait);

    const result = await fn();

    // Give the server-side create-domain a head start before the next one can begin.
    await sleep(env.provision.hostingSettleMs);
    writeLast(Date.now());
    return result;
  } finally {
    release();
  }
}

/** Reset gate state at the start of a run (called by global-setup). */
export function resetProvisionGate(): void {
  ensureRoot();
  rmSync(lockDir, { recursive: true, force: true });
  rmSync(tsFile, { force: true });
}
