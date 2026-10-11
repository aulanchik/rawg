import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '@/utils/errors';
import { Logger } from '@/utils/logger';

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
};

// Express recognises error middleware by its four-argument signature, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    if (err.retryAfter !== undefined) {
      res.set('Retry-After', String(Math.ceil(err.retryAfter)));
    }
    res.status(err.status).json({ error: err.message });
    return;
  }

  Logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  res.status(500).json({ error: 'Internal server error' });
};
