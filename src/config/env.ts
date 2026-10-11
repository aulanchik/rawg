import 'dotenv/config';

const isBlank = (value: string | undefined): value is undefined | '' =>
  value === undefined || value.trim() === '';

/**
 * Reads an environment variable that must be one of `allowed` (case-insensitive).
 * Returns `fallback` when unset or empty, and throws on any other value so a typo
 * like CACHE_DRIVER=reddis fails at startup instead of silently using the wrong cache.
 */
const oneOf = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const rawValue = process.env[name];

  if (isBlank(rawValue)) {
    return fallback;
  }

  const value = rawValue.trim().toLowerCase();

  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(
      `Environment variable ${name} must be one of: ${allowed.join(', ')} (got "${rawValue}")`,
    );
  }

  return value as T;
};

/**
 * Reads an environment variable as an integer.
 * Returns `fallback` when unset or empty, and throws when it isn't an integer.
 */
const int = (name: string, fallback: number): number => {
  const rawValue = process.env[name];

  if (isBlank(rawValue)) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value)) {
    throw new Error(`Environment variable ${name} must be an integer, but got ${rawValue}`);
  }

  return value;
};

/**
 * Reads an environment variable as a positive number (fractions allowed,
 * e.g. RATE_LIMIT_REFILL_RATE=0.5). Returns `fallback` when unset or empty.
 */
const positiveFloat = (name: string, fallback: number): number => {
  const rawValue = process.env[name];

  if (isBlank(rawValue)) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number, but got ${rawValue}`);
  }

  return value;
};

/**
 * Reads an environment variable as a string.
 * Returns `fallback` when unset or empty (whitespace only counts as empty).
 */
const str = (name: string, fallback: string): string => {
  const rawValue = process.env[name];

  return isBlank(rawValue) ? fallback : rawValue.trim();
};

/**
 * Reads a required environment variable as a string.
 * Throws when unset or empty, so the app fails at startup instead of
 * running with a missing secret or connection string.
 */
const requiredStr = (name: string): string => {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return rawValue;
};

/** Reads a comma-separated list, dropping blanks. Returns an empty list when unset. */
const list = (name: string): string[] =>
  (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const nodeEnv = str('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const cacheDriver = oneOf('CACHE_DRIVER', ['memory', 'redis'] as const, 'memory');

const config = {
  nodeEnv,
  isProduction,
  port: int('PORT', 3000),
  enableMorgan: !isProduction,

  // The key is appended to upstream requests only. It is never sent to clients or logged.
  api: str('RAWG_API', 'https://api.rawg.io/api').replace(/\/$/, ''),
  apiKey: requiredStr('RAWG_API_KEY'),

  // Keys that clients must send in the X-API-Key header. Empty means the proxy is open.
  clientApiKeys: list('PROXY_API_KEYS'),

  requestTimeoutMs: int('REQUEST_TIMEOUT_MS', 15000),
  maxRetries: int('MAX_RETRIES', 3),

  rateLimitCapacity: positiveFloat('RATE_LIMIT_CAPACITY', 20),
  rateLimitRefillRate: positiveFloat('RATE_LIMIT_REFILL_RATE', 10),

  cacheDriver,
  cacheTtlSeconds: int('CACHE_TTL_SECONDS', 3600),
  cacheMaxEntries: int('CACHE_MAX_ENTRIES', 500),

  // Only required with CACHE_DRIVER=redis. The URL may contain a password, so it is never logged.
  redisUrl: cacheDriver === 'redis' ? requiredStr('REDIS_URL') : str('REDIS_URL', ''),
  redisKeyPrefix: str('REDIS_KEY_PREFIX', 'rawg-proxy:cache:'),
  redisCommandTimeoutMs: int('REDIS_COMMAND_TIMEOUT_MS', 500),
} as const;

export { config };
