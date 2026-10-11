import type { Redis } from 'ioredis';
import { Logger } from '@/utils/logger';
import type { Cache, CacheStatus } from './types';

export interface RedisCacheOptions {
  /** Prepended to every key so the proxy can share a Redis database with other apps. */
  keyPrefix: string;
  /** Entry lifetime. Zero or less disables caching. */
  ttlSeconds: number;
}

// Redis errors repeat on every failed command and reconnect; log each distinct message
// at most once per interval, so an unrelated earlier error can't hide a new outage.
const ERROR_LOG_INTERVAL_MS = 30_000;
const MAX_TRACKED_MESSAGES = 50;

/**
 * Shared cache backed by Redis. Values are stored as JSON strings with SET ... EX,
 * so Redis expires them itself.
 *
 * Fail-open: if Redis is down, slow or returns garbage, `get` reports a miss and `set`
 * does nothing, so the proxy keeps serving straight from RAWG.
 */
export class RedisCache<V> implements Cache<V> {
  readonly driver = 'redis' as const;

  private readonly lastLoggedAt = new Map<string, number>();

  constructor(
    private readonly client: Redis,
    private readonly options: RedisCacheOptions,
  ) {
    // ioredis emits 'error' on every failed connection attempt; without a listener it
    // prints its own noisy "Unhandled error event" message each time.
    client.on('error', (err: Error) => this.logError('connection', err));
  }

  async get(key: string): Promise<V | undefined> {
    try {
      const raw = await this.client.get(this.options.keyPrefix + key);

      if (raw === null) {
        return undefined;
      }

      return JSON.parse(raw) as V;
    } catch (err) {
      // Covers connection errors, command timeouts and unparsable values.
      this.logError('get', err);
      return undefined;
    }
  }

  async set(key: string, value: V): Promise<void> {
    if (this.options.ttlSeconds <= 0) {
      return;
    }

    try {
      await this.client.set(
        this.options.keyPrefix + key,
        JSON.stringify(value),
        'EX',
        this.options.ttlSeconds,
      );
    } catch (err) {
      this.logError('set', err);
    }
  }

  status(): CacheStatus {
    return { driver: 'redis', connected: this.client.status === 'ready' };
  }

  async close(): Promise<void> {
    try {
      await this.client.quit(); // lets in-flight commands finish
    } catch {
      this.client.disconnect(); // not connected, so quit can't be sent
    }
  }

  private logError(operation: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const now = Date.now();
    const last = this.lastLoggedAt.get(message);

    if (last !== undefined && now - last < ERROR_LOG_INTERVAL_MS) {
      return;
    }

    if (this.lastLoggedAt.size >= MAX_TRACKED_MESSAGES) {
      this.lastLoggedAt.clear(); // messages can embed values; never let this grow without bound
    }

    this.lastLoggedAt.set(message, now);
    Logger.warn(`[Cache] redis ${operation} failed, treating as cache miss: ${message}`);
  }
}
