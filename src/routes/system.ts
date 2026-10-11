import { Router } from 'express';
import { config } from '@/config/env';
import { rateLimiter, responseCache } from '@/services/rawg';
import { getInFlightCount } from '@/utils/deduplicate';

const router = Router();

/** Liveness probe for load balancers and orchestrators. */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (!config.isProduction) {
  router.get('/debug/in-flight', (_req, res) => {
    res.json({ inFlightRequests: getInFlightCount() });
  });

  router.get('/debug/rate-limit', (_req, res) => {
    res.json(rateLimiter.getStatus());
  });

  router.get('/debug/cache', (_req, res) => {
    res.json(responseCache.status());
  });
}

export default router;
