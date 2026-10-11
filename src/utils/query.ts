import type { Request } from 'express';
import { HttpError } from '@/utils/errors';

type Query = Request['query'];

/** Which query parameters an endpoint accepts besides `page` and `page_size`. */
export interface ParamSpec {
  strings: readonly string[];
  booleans: readonly string[];
}

/** Filters for GET /games, as documented at https://api.rawg.io/docs/. */
export const GAMES_PARAMS: ParamSpec = {
  strings: [
    'search',
    'parent_platforms',
    'platforms',
    'stores',
    'developers',
    'publishers',
    'genres',
    'tags',
    'creators',
    'dates',
    'updated',
    'platforms_count',
    'metacritic',
    'ordering',
  ],
  booleans: [
    'search_precise',
    'search_exact',
    'exclude_collection',
    'exclude_additions',
    'exclude_parents',
    'exclude_game_series',
    'exclude_stores',
  ],
};

/** Lists such as genres, tags or developers. */
export const ORDERED_PARAMS: ParamSpec = { strings: ['ordering'], booleans: [] };

/** Endpoints that only paginate. */
export const PAGING_ONLY: ParamSpec = { strings: [], booleans: [] };

export const MAX_PAGE_SIZE = 40; // RAWG limit
const MAX_VALUE_LENGTH = 200; // keeps cache keys and upstream URLs bounded
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

const single = (query: Query, name: string): string | undefined => {
  const value = query[name];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `Query parameter "${name}" must be a single value`);
  }

  const trimmed = value.trim();

  if (trimmed.length > MAX_VALUE_LENGTH) {
    throw new HttpError(400, `Query parameter "${name}" is too long`);
  }

  return trimmed === '' ? undefined : trimmed;
};

const integer = (query: Query, name: string, min: number, max?: number): number | undefined => {
  const raw = single(query, name);

  if (raw === undefined) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    throw new HttpError(400, `Query parameter "${name}" must be an integer`);
  }

  const value = Number(raw);

  if (value < min) {
    throw new HttpError(400, `Query parameter "${name}" must be at least ${min}`);
  }

  return max === undefined ? value : Math.min(value, max);
};

const boolean = (query: Query, name: string): boolean | undefined => {
  const raw = single(query, name)?.toLowerCase();

  if (raw === undefined) {
    return undefined;
  }

  if (raw !== 'true' && raw !== 'false') {
    throw new HttpError(400, `Query parameter "${name}" must be true or false`);
  }

  return raw === 'true';
};

/**
 * Builds the RAWG query string for a list endpoint. Anything not in `spec`
 * (plus `page` and `page_size`) is dropped, including any `key` the client sends.
 */
export const parseListParams = (query: Query, spec: ParamSpec): Record<string, string> => {
  const params: Record<string, string> = {};

  for (const name of spec.strings) {
    const value = single(query, name);
    if (value !== undefined) params[name] = value;
  }

  for (const name of spec.booleans) {
    const value = boolean(query, name);
    if (value !== undefined) params[name] = String(value);
  }

  const page = integer(query, 'page', 1);
  if (page !== undefined) params.page = String(page);

  const pageSize = integer(query, 'page_size', 1, MAX_PAGE_SIZE);
  if (pageSize !== undefined) params.page_size = String(pageSize);

  return params;
};

/** Validates a resource ID or slug, e.g. `3498` or `grand-theft-auto-v`. */
export const parseId = (raw: string | string[] | undefined): string => {
  const id = typeof raw === 'string' ? raw.trim() : undefined;

  if (!id) {
    throw new HttpError(400, 'ID parameter is required');
  }

  if (!ID_PATTERN.test(id)) {
    throw new HttpError(400, 'Invalid ID');
  }

  return id;
};
