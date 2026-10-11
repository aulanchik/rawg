import { Router } from 'express';
import { RawgController } from '@/controllers/rawg';
import { requireApiKey } from '@/middleware/auth';
import { GAMES_PARAMS, ORDERED_PARAMS, PAGING_ONLY, ParamSpec } from '@/utils/query';

const router = Router();

router.use(requireApiKey);

/** Every top-level RAWG collection, with the query parameters its list endpoint accepts. */
const COLLECTIONS: Record<string, ParamSpec> = {
  games: GAMES_PARAMS,
  creators: PAGING_ONLY,
  developers: ORDERED_PARAMS,
  genres: ORDERED_PARAMS,
  platforms: ORDERED_PARAMS,
  publishers: ORDERED_PARAMS,
  stores: ORDERED_PARAMS,
  tags: ORDERED_PARAMS,
};

/** Paginated lists hanging off a single game: GET /games/:id/<relation>. */
const GAME_RELATIONS = [
  'additions',
  'development-team',
  'game-series',
  'parent-games',
  'screenshots',
  'stores',
] as const;

for (const [collection, spec] of Object.entries(COLLECTIONS)) {
  router.get(`/${collection}`, RawgController.list(`/${collection}`, spec));
  router.get(`/${collection}/:id`, RawgController.detail(collection));
}

for (const relation of GAME_RELATIONS) {
  router.get(`/games/:id/${relation}`, RawgController.gameRelation(relation, PAGING_ONLY));
}

router.get(
  '/platforms/lists/parents',
  RawgController.list('/platforms/lists/parents', ORDERED_PARAMS),
);

export default router;
