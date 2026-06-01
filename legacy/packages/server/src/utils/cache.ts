/**
 * Simple in-memory cache with TTL (Time To Live).
 * No Redis needed — just a Map with expiry checking.
 */
export class TtlCache<V> {
  private cache = new Map<string, { value: V; expiry: number }>();
  private hits = 0;
  private misses = 0;
  private name: string;

  constructor(name: string, private ttlMs: number = 300_000) {
    this.name = name;
  }

  get(key: string): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: V): void {
    // Clean expired entries periodically (every 100 sets)
    if (this.cache.size > 0 && this.cache.size % 100 === 0) {
      this.cleanup();
    }
    this.cache.set(key, { value, expiry: Date.now() + this.ttlMs });
  }

  private cleanup(): void {
    const now = Date.now();
    const before = this.cache.size;
    for (const [k, v] of this.cache) {
      if (now > v.expiry) this.cache.delete(k);
    }
    if (before !== this.cache.size) {
      this.logMetrics();
    }
  }

  logMetrics(): void {
    const total = this.hits + this.misses;
    if (total === 0) return;
    const ratio = Math.round((this.hits / total) * 100);
    console.log(`[cache:${this.name}] ${this.hits} hits, ${this.misses} misses (${ratio}% hit rate, ${this.cache.size} entries)`);
    this.hits = 0;
    this.misses = 0;
  }

  clear(): void {
    this.logMetrics();
    this.cache.clear();
  }
}
