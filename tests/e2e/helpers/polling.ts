/**
 * Explicit polling utilities. The suite never uses arbitrary sleeps — it polls
 * a predicate until it is satisfied or a deadline passes, capturing the last
 * observed value so failures are diagnosable.
 */
import { env } from "../config/env";

export type PollOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  description?: string;
};

export class PollTimeoutError<T> extends Error {
  constructor(description: string, public readonly lastValue: T, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for: ${description}. Last value: ${safeJson(lastValue)}`);
    this.name = "PollTimeoutError";
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Repeatedly evaluate `produce` until `predicate(value)` is true. Returns the
 * first satisfying value. Throws {@link PollTimeoutError} (with the last value)
 * on timeout. Transient errors from `produce` are tolerated until the deadline.
 */
export async function pollUntil<T>(
  produce: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: PollOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? env.timeouts.provisioningMs;
  const intervalMs = options.intervalMs ?? env.timeouts.pollIntervalMs;
  const description = options.description ?? "condition";
  const deadline = Date.now() + timeoutMs;

  let lastValue: T | undefined;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      lastValue = await produce();
      if (predicate(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastValue === undefined && lastError) {
    throw new PollTimeoutError(`${description} (last error: ${String(lastError)})`, undefined as T, timeoutMs);
  }
  throw new PollTimeoutError(description, lastValue as T, timeoutMs);
}
