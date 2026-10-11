export type CacheDriver = 'memory' | 'redis';

export interface CacheStatus {
  driver: CacheDriver;
  /** Number of entries (memory driver only). */
  size?: number;
  /** Whether the Redis connection is ready (redis driver only). */
  connected?: boolean;
}

/**
 * Response cache used by the RAWG service.
 *
 * Implementations must be fail-open: a broken backend only ever means "cache miss",
 * so neither `get` nor `set` may reject. Caching is an optimisation, never a dependency.
 */
export interface Cache<V> {
  readonly driver: CacheDriver;

  /** Resolves to `undefined` on a miss, an expired entry, or a backend failure. */
  get(key: string): Promise<V | undefined>;

  /** Stores `value` for the configured TTL. A failed write just means the entry isn't cached. */
  set(key: string, value: V): Promise<void>;

  status(): CacheStatus;

  /** Releases connections and memory. Safe to call during shutdown. */
  close(): Promise<void>;
}
