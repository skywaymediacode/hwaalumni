import { hashOpaqueToken } from "./tokens";

export interface RateLimitPolicy {
  windowMs: number;
  allowedAttempts: number;
  baseBlockMs: number;
  maximumBlockMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(bucket: string, key: string, policy: RateLimitPolicy, now?: Date): Promise<RateLimitResult>;
  clear(bucket: string, key: string): Promise<void>;
}

interface Entry {
  attempts: number;
  windowStartedAt: number;
  blockedUntil: number;
}

export class MemoryRateLimiter implements RateLimiter {
  readonly #entries = new Map<string, Entry>();

  async consume(bucket: string, key: string, policy: RateLimitPolicy, now = new Date()): Promise<RateLimitResult> {
    const mapKey = `${bucket}:${hashOpaqueToken(key)}`;
    const nowMs = now.getTime();
    const current = this.#entries.get(mapKey);
    if (current && current.blockedUntil > nowMs) {
      return { allowed: false, retryAfterSeconds: Math.ceil((current.blockedUntil - nowMs) / 1000) };
    }

    const entry = !current || nowMs - current.windowStartedAt >= policy.windowMs
      ? { attempts: 0, windowStartedAt: nowMs, blockedUntil: 0 }
      : current;
    entry.attempts += 1;
    if (entry.attempts > policy.allowedAttempts) {
      const exponent = entry.attempts - policy.allowedAttempts - 1;
      const blockMs = Math.min(policy.baseBlockMs * 2 ** exponent, policy.maximumBlockMs);
      entry.blockedUntil = nowMs + blockMs;
      this.#entries.set(mapKey, entry);
      return { allowed: false, retryAfterSeconds: Math.ceil(blockMs / 1000) };
    }

    this.#entries.set(mapKey, entry);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async clear(bucket: string, key: string): Promise<void> {
    this.#entries.delete(`${bucket}:${hashOpaqueToken(key)}`);
  }
}
