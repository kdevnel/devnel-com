/**
 * Per-IP rate limiting for the contact form.
 *
 * The in-memory limiter is accurate when one long-lived process handles every
 * request (Node standalone behind Caddy). It resets on restart, which is fine
 * for a contact form.
 *
 * On serverless or Workers each instance has its own memory, so it's only
 * best-effort there. To move it:
 * - Cloudflare: use a Workers Rate Limiting binding, or a WAF rate-limiting
 *   rule on /api/contact, and implement RateLimiter with it.
 * - Anywhere else: implement RateLimiter on Redis (INCR + EXPIRE on
 *   "contact:<ip>:<window>") or a KV store, and swap it in api/contact.ts.
 */
export interface RateLimiter {
  /** Records a hit and says whether it's allowed. */
  hit(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

/**
 * Sliding-window limiter with a hard cap on how many keys it tracks, so
 * memory stays bounded however many addresses an attacker uses. Map keeps
 * insertion order, and each hit re-inserts its key, so the first key is
 * always the least recently seen: that's the one evicted at the cap.
 */
export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit = 5,
    private readonly windowMs = 60 * 60 * 1000,
    private readonly maxKeys = 5_000,
  ) {}

  async hit(key: string) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.delete(key);

    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterSeconds = Math.ceil((recent[0]! + this.windowMs - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    this.hits.set(key, recent);
    while (this.hits.size > this.maxKeys) {
      this.hits.delete(this.hits.keys().next().value!);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** Number of keys currently tracked (for tests). */
  get size() {
    return this.hits.size;
  }
}
