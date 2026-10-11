import { config } from '@/config/env';
import { createCache } from '@/cache';
import { rewritePagination } from '@/utils/links';
import { deduplicate } from '@/utils/deduplicate';
import { HttpError } from '@/utils/errors';
import { RateLimiter } from '@/utils/limiter';
import { Logger } from '@/utils/logger';

export interface ServiceResult {
  data: unknown;
  fromCache: boolean;
}

/** In-memory or Redis, chosen by CACHE_DRIVER. Call `responseCache.close()` on shutdown. */
export const responseCache = createCache<unknown>(config);

export const rateLimiter = new RateLimiter(config.rateLimitCapacity, config.rateLimitRefillRate);

const upstreamBasePath = new URL(config.api).pathname.replace(/\/$/, '');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retryAfterSeconds = (res: Response): number | undefined => {
  const raw = res.headers.get('retry-after');
  const value = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};

/** Delay before retry `attempt` (0-based): Retry-After when sent, else exponential backoff with jitter. */
const retryDelayMs = (attempt: number, res?: Response): number => {
  const retryAfter = res ? retryAfterSeconds(res) : undefined;

  if (retryAfter !== undefined) {
    return Math.min(retryAfter, 10) * 1000;
  }

  return Math.min(500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
};

const isRetryable = (res: Response): boolean => res.status === 429 || res.status >= 500;

const upstreamMessage = async (res: Response): Promise<string> => {
  const text = await res.text().catch(() => '');

  if (!text) {
    return `RAWG responded with status ${res.status}`;
  }

  try {
    const body = JSON.parse(text);
    const detail = body?.detail ?? body?.error ?? body?.message;
    return typeof detail === 'string' && detail ? detail : text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
};

const toHttpError = async (res: Response): Promise<HttpError> => {
  const message = await upstreamMessage(res);

  // Pass through errors the caller can act on; hide upstream auth and server problems.
  if (res.status === 400 || res.status === 404) {
    return new HttpError(res.status, message);
  }

  if (res.status === 429) {
    return new HttpError(429, 'RAWG rate limit exceeded', retryAfterSeconds(res));
  }

  Logger.warn(`[RAWG] upstream error ${res.status}: ${message}`);
  return new HttpError(502, 'RAWG request failed');
};

const fetchRawg = async (path: string, params: Record<string, string>): Promise<unknown> => {
  const url = new URL(`${config.api}${path}`);

  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  // RAWG authenticates with a `key` query parameter. Added last so a client can't override it.
  // Never log `url`: it contains the key.
  url.searchParams.set('key', config.apiKey);

  for (let attempt = 0; ; attempt++) {
    try {
      await rateLimiter.acquire();
    } catch {
      throw new HttpError(503, 'Proxy is saturated, try again shortly', 1);
    }

    let res: Response;

    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
    } catch {
      if (attempt < config.maxRetries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw new HttpError(504, 'RAWG did not respond in time');
    }

    if (res.ok) {
      try {
        return rewritePagination(await res.json(), upstreamBasePath);
      } catch {
        throw new HttpError(502, 'RAWG returned an invalid response');
      }
    }

    if (isRetryable(res) && attempt < config.maxRetries) {
      const delay = retryDelayMs(attempt, res);
      await res.arrayBuffer().catch(() => undefined); // release the connection
      Logger.info(`[RAWG] ${res.status} on ${path}, retry ${attempt + 1} in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    throw await toHttpError(res);
  }
};

/** Cache/dedupe key. Built from the path and client params only, so the API key never ends up in it. */
const cacheKey = (path: string, params: Record<string, string>): string => {
  const query = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join('&');

  return `${path}?${query}`;
};

/**
 * GETs `path` from RAWG with the server-side API key, through the cache, request
 * de-duplication, rate limiter and retries.
 */
export const getRawg = async (
  path: string,
  params: Record<string, string> = {},
): Promise<ServiceResult> => {
  const key = cacheKey(path, params);

  const cached = await responseCache.get(key);
  if (cached !== undefined) {
    return { data: cached, fromCache: true };
  }

  const data = await deduplicate(key, async () => {
    const fresh = await fetchRawg(path, params);
    // Not awaited: the caller shouldn't wait on the cache write, and set() never rejects.
    void responseCache.set(key, fresh);
    return fresh;
  });

  return { data, fromCache: false };
};
