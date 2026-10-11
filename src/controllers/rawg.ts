import type { RequestHandler, Response } from 'express';
import { getRawg, ServiceResult } from '@/services/rawg';
import { ParamSpec, parseId, parseListParams } from '@/utils/query';

const send = (res: Response, result: ServiceResult): void => {
  res.set('X-Cache', result.fromCache ? 'HIT' : 'MISS');
  res.json(result.data);
};

// Express 5 forwards rejected promises from async handlers to the error middleware.
export class RawgController {
  /** GET <path>?page=&page_size=&... with the parameters allowed by `spec`. */
  static list(path: string, spec: ParamSpec): RequestHandler {
    return async (req, res) => {
      send(res, await getRawg(path, parseListParams(req.query, spec)));
    };
  }

  /** GET /<collection>/:id, where the id is numeric or a slug. */
  static detail(collection: string): RequestHandler {
    return async (req, res) => {
      send(res, await getRawg(`/${collection}/${parseId(req.params.id)}`));
    };
  }

  /** GET /games/:id/<relation>, e.g. screenshots or additions. */
  static gameRelation(relation: string, spec: ParamSpec): RequestHandler {
    return async (req, res) => {
      const path = `/games/${parseId(req.params.id)}/${relation}`;
      send(res, await getRawg(path, parseListParams(req.query, spec)));
    };
  }
}
