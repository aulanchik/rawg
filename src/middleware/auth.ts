import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '@/config/env';
import { HttpError } from '@/utils/errors';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

// Hashing gives equal-length buffers, which timingSafeEqual requires, and avoids
// leaking key length through comparison time.
const allowedDigests = config.clientApiKeys.map(digest);

/**
 * Requires a valid `X-API-Key` header when PROXY_API_KEYS is configured.
 * With no keys configured the proxy is open and every request passes.
 */
export const requireApiKey: RequestHandler = (req, _res, next) => {
  if (allowedDigests.length === 0) {
    next();
    return;
  }

  const provided = req.get('x-api-key');
  const valid =
    provided !== undefined &&
    allowedDigests.map((allowed) => timingSafeEqual(allowed, digest(provided))).includes(true);

  next(valid ? undefined : new HttpError(401, 'Missing or invalid API key'));
};
