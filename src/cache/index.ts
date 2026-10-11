import { Redis } from 'ioredis';
import { MemoryCache } from './memory';
import { RedisCache } from './redis';
import type { Cache, CacheDriver } from './types';

export type { Cache, CacheDriver, CacheStatus } from './types';

/** The part of `config` that decides which cache is built, so tests can pass their own. */
export interface CacheSettings {
  cacheDriver: CacheDriver;
  cacheTtlSeconds: number;
  cacheMaxEntries: number;
  redisUrl: string;
  redisKeyPrefix: string;
  redisCommandTimeoutMs: number;
}

export function createCache<V>(settings: CacheSettings): Cache<V> {
  if (settings.cacheDriver === 'redis') {
    const client = new Redis(settings.redisUrl, {
      // Fail fast instead of queueing commands while disconnected, and bound slow ones.
      enableOfflineQueue: false,
      commandTimeout: settings.redisCommandTimeoutMs,
      maxRetriesPerRequest: 1,
      // Keep trying to reconnect forever, backing off to at most 2 seconds.
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 2000),
    });

    return new RedisCache<V>(client, {
      keyPrefix: settings.redisKeyPrefix,
      ttlSeconds: settings.cacheTtlSeconds,
    });
  }

  return new MemoryCache<V>(settings.cacheMaxEntries, settings.cacheTtlSeconds);
}
