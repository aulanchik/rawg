import type { Cache, CacheStatus } from './types';

interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * In-process cache with a TTL and a size cap (least-recently-used eviction).
 * Not shared between instances; use the Redis driver when running more than one.
 */
export class MemoryCache<V> implements Cache<V> {
  readonly driver = 'memory' as const;

  private readonly entries = new Map<string, Entry<V>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlSeconds: number,
  ) {}

  async get(key: string): Promise<V | undefined> {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    // Re-insert so the most recently used key is last in iteration order.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  async set(key: string, value: V): Promise<void> {
    if (this.maxEntries <= 0 || this.ttlSeconds <= 0) {
      return;
    }

    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlSeconds * 1000 });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  status(): CacheStatus {
    return { driver: 'memory', size: this.entries.size };
  }

  async close(): Promise<void> {
    this.entries.clear();
  }
}
