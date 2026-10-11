# RAWG Proxy

A small, stateless Express + TypeScript service that sits in front of the [RAWG Video Games Database API](https://api.rawg.io/docs/).

RAWG requires an API key as a query parameter (`?key=...`) on every request. Calling it straight from a browser or mobile app would expose that key to everyone. This proxy keeps the key on the server, so your clients just call the proxy.

On top of that it:

- whitelists and validates query parameters,
- caches responses (in memory or in Redis) and merges identical concurrent requests, to save your RAWG quota,
- retries transient upstream failures with backoff,
- optionally requires its own client key, so strangers can't spend your quota,
- returns consistent JSON errors.

## Contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Using the proxy](#using-the-proxy)
- [Authentication](#authentication)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Errors](#errors)
- [Caching](#caching)
- [Reliability: de-duplication, rate limiting and retries](#reliability-de-duplication-rate-limiting-and-retries)
- [Security notes](#security-notes)
- [Running in production](#running-in-production)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Development](#development)
- [Limitations](#limitations)

## How it works

```
 Client                         Proxy                                  RAWG
   |   GET /games?search=zelda    |                                      |
   |----------------------------->| 1. check X-API-Key (if enabled)      |
   |                              | 2. validate + whitelist parameters   |
   |                              | 3. cache hit? -> return it           |
   |                              | 4. merge identical in-flight calls   |
   |                              | 5. acquire rate-limit token          |
   |                              |  GET /api/games?search=zelda&key=... |
   |                              |------------------------------------->|
   |                              |<-------------------------------------|
   |                              | 6. rewrite next/previous links       |
   |                              | 7. cache the response                |
   |<-----------------------------| 8. return JSON + X-Cache header      |
```

The client never sees the RAWG key, and never needs to send it.

## Quick start

### Requirements

- Node.js 18 or newer (the service uses the built-in `fetch` and `AbortSignal.timeout`)
- [pnpm](https://pnpm.io/)
- A RAWG API key from <https://rawg.io/apidocs>
- Redis, only if you want a shared cache (`CACHE_DRIVER=redis`)

### Install and run

```bash
pnpm install
cp .env.example .env      # then edit .env and set RAWG_API_KEY
pnpm dev
```

The minimal `.env` for local development is:

```
RAWG_API_KEY=your_real_rawg_key
PROXY_API_KEYS=
```

Leaving `PROXY_API_KEYS` empty turns client authentication off, which is convenient locally.

You should see `Server is up at port 3000 (cache: memory)`. Check it:

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl "http://localhost:3000/games?search=zelda&page_size=3"
```

The app refuses to start without `RAWG_API_KEY`, so a misconfigured deployment fails immediately instead of failing on the first request.

## Using the proxy

The proxy mirrors RAWG's paths **without** the `/api` prefix, and you never add `?key=`:

| RAWG URL                                     | Proxy URL                                  |
| -------------------------------------------- | ------------------------------------------ |
| `https://api.rawg.io/api/platforms`          | `http://localhost:3000/platforms`          |
| `https://api.rawg.io/api/games?search=zelda` | `http://localhost:3000/games?search=zelda` |
| `https://api.rawg.io/api/games/3498`         | `http://localhost:3000/games/3498`         |
| `https://api.rawg.io/api/games/3498/stores`  | `http://localhost:3000/games/3498/stores`  |

`http://localhost:3000/api/platforms` returns a 404, because `/api` is not part of the proxy's routes.

### Examples

```bash
# Search games
curl -i "http://localhost:3000/games?search=zelda&page_size=3"

# Filter and sort
curl "http://localhost:3000/games?genres=action&ordering=-rating&page_size=5"

# One game by ID or slug
curl "http://localhost:3000/games/3498"
curl "http://localhost:3000/games/grand-theft-auto-v"

# Screenshots of a game
curl "http://localhost:3000/games/3498/screenshots"

# Reference lists
curl "http://localhost:3000/genres"
curl "http://localhost:3000/platforms"

# With client authentication enabled
curl -H "X-API-Key: your_client_key" "http://localhost:3000/platforms"
```

On Windows PowerShell use `curl.exe` instead of `curl`.

### From a frontend

```js
const PROXY = 'http://localhost:3000';

const res = await fetch(`${PROXY}/games?search=zelda&page_size=10`, {
  // Only needed when PROXY_API_KEYS is set:
  headers: { 'X-API-Key': import.meta.env.VITE_PROXY_KEY },
});

if (!res.ok) {
  const { error } = await res.json();
  throw new Error(error);
}

const page = await res.json();
// page.results is the list of games

// next/previous are relative to the proxy, so prefix them:
const nextPage = page.next ? await (await fetch(`${PROXY}${page.next}`)).json() : null;
```

CORS is enabled for all origins, and custom headers such as `X-API-Key` are accepted.

### Pagination links

RAWG returns `next` and `previous` as absolute upstream URLs that include your API key. The proxy rewrites them to relative links on itself, with the key removed:

```json
{
  "count": 1203,
  "next": "/games?page=2&page_size=3&search=zelda",
  "previous": null,
  "results": []
}
```

Prefix them with the proxy's address to follow them. A link the proxy can't parse becomes `null`.

## Authentication

There are two unrelated keys:

| Variable         | Whose key                          | Who sees it                     |
| ---------------- | ---------------------------------- | ------------------------------- |
| `RAWG_API_KEY`   | Your RAWG account key              | Only the server                 |
| `PROXY_API_KEYS` | Keys you invent for your own users | The clients you choose to allow |

`PROXY_API_KEYS` is optional. It controls who may use your proxy, and therefore who spends your RAWG quota.

- **Empty or unset:** the proxy is open. Fine for local development. The server prints a warning at startup.
- **One or more comma-separated keys:** every RAWG route requires a matching `X-API-Key` header. Missing or wrong keys get `401 {"error":"Missing or invalid API key"}` and the request never reaches RAWG.

```
PROXY_API_KEYS=k7f3a9c2e1b84d60,m2x8q5w1z9v4n7r3
```

```bash
curl -H "X-API-Key: k7f3a9c2e1b84d60" "http://localhost:3000/platforms"
```

Details:

- A browser address bar cannot send custom headers, so with a key set you must use `curl`, Postman, `fetch` or similar.
- Several keys let you give each client its own and revoke one by removing it from the list and restarting.
- Comparison is constant-time, and the keys are hashed first so length does not leak.
- `/health` never requires a key. When a key is set, unknown paths also return `401` instead of `404`.
- Generate a key with: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
- A key embedded in browser JavaScript can be read by anyone who opens DevTools. For stronger protection, call the proxy from your own backend and keep the key there.
- Never put your RAWG key in `PROXY_API_KEYS`.

## Configuration

Set variables in `.env` (see `.env.example`). Restart the server after changing them.

| Variable                   | Default                   | Description                                                                   |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `RAWG_API_KEY`             | (required)                | Your RAWG API key. The app refuses to start without it.                       |
| `PROXY_API_KEYS`           | (empty)                   | Comma-separated client keys for the `X-API-Key` header. Empty means open.     |
| `PORT`                     | `3000`                    | HTTP port.                                                                    |
| `NODE_ENV`                 | `development`             | In `production`, request logging and the debug routes are disabled.           |
| `RAWG_API`                 | `https://api.rawg.io/api` | Upstream base URL. A trailing slash is stripped.                              |
| `REQUEST_TIMEOUT_MS`       | `15000`                   | Timeout for each upstream attempt.                                            |
| `MAX_RETRIES`              | `3`                       | Retries after the first attempt, for 5xx, 429 and network failures.           |
| `RATE_LIMIT_CAPACITY`      | `20`                      | Token-bucket size: the largest burst of upstream requests.                    |
| `RATE_LIMIT_REFILL_RATE`   | `10`                      | Tokens added per second. Fractions are allowed.                               |
| `CACHE_DRIVER`             | `memory`                  | `memory` or `redis`. Any other value fails at startup.                        |
| `CACHE_TTL_SECONDS`        | `3600`                    | How long a response stays cached. `0` or less disables caching.               |
| `CACHE_MAX_ENTRIES`        | `500`                     | Maximum cached responses for the memory driver (least recently used evicted). |
| `REDIS_URL`                | (required for redis)      | e.g. `redis://localhost:6379`. Use `rediss://` for TLS. Never logged.         |
| `REDIS_KEY_PREFIX`         | `rawg-proxy:cache:`       | Prefix for cache keys, so the Redis database can be shared with other apps.   |
| `REDIS_COMMAND_TIMEOUT_MS` | `500`                     | Per-command timeout. Slower commands count as cache misses.                   |

Integer and number settings that are malformed (for example `PORT=abc`) fail at startup with a clear message.

## API reference

All routes are `GET`. When `PROXY_API_KEYS` is set, send `X-API-Key`.

### Lists

| Route                      | Accepted parameters                             |
| -------------------------- | ----------------------------------------------- |
| `/games`                   | `page`, `page_size`, and the game filters below |
| `/creators`                | `page`, `page_size`                             |
| `/developers`              | `page`, `page_size`, `ordering`                 |
| `/genres`                  | `page`, `page_size`, `ordering`                 |
| `/platforms`               | `page`, `page_size`, `ordering`                 |
| `/platforms/lists/parents` | `page`, `page_size`, `ordering`                 |
| `/publishers`              | `page`, `page_size`, `ordering`                 |
| `/stores`                  | `page`, `page_size`, `ordering`                 |
| `/tags`                    | `page`, `page_size`, `ordering`                 |

Rules for every list:

- `page` is an integer, 1 or higher.
- `page_size` is an integer from 1 to 40. Larger values are clamped to 40, which is RAWG's maximum.
- Each value is limited to 200 characters.
- Repeating a parameter (`?genres=a&genres=b`) returns `400`. Use one value; for multiple values, RAWG expects a comma-separated list (`genres=action,indie`).
- Anything not listed for the route is dropped silently. This includes any `key` a client sends.

#### Game filters (`/games`)

| Parameter                                                                                             | Notes                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `search`                                                                                              | Free-text search.                              |
| `search_precise`, `search_exact`                                                                      | `true` or `false`.                             |
| `parent_platforms`, `platforms`, `stores`, `developers`, `publishers`, `genres`, `tags`, `creators`   | IDs or slugs, comma-separated.                 |
| `dates`, `updated`                                                                                    | Date ranges, e.g. `2020-01-01,2020-12-31`.     |
| `platforms_count`, `metacritic`                                                                       | Passed to RAWG as given.                       |
| `ordering`                                                                                            | e.g. `-rating`, `released`. A `-` reverses it. |
| `exclude_collection`, `exclude_additions`, `exclude_parents`, `exclude_game_series`, `exclude_stores` | `true` or `false`.                             |

See the [RAWG docs](https://api.rawg.io/docs/) for the meaning of each filter.

### Single resources

`GET /<collection>/<id>` for `games`, `creators`, `developers`, `genres`, `platforms`, `publishers`, `stores` and `tags`.

`<id>` is a numeric ID or a slug (letters, digits, `-`, `_`, up to 100 characters). No query parameters are forwarded.

### Per-game lists

`GET /games/<id>/<relation>`, where `<relation>` is one of `additions`, `development-team`, `game-series`, `parent-games`, `screenshots` or `stores`. They accept `page` and `page_size`.

### Utility routes

| Route                   | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `GET /health`           | Always `{"status":"ok"}`. No authentication. Use it for liveness probes. |
| `GET /debug/in-flight`  | Number of upstream requests in flight. Non-production only.              |
| `GET /debug/rate-limit` | State of the local token bucket. Non-production only.                    |
| `GET /debug/cache`      | Cache driver and size or connection state. Non-production only.          |

The debug routes are not mounted when `NODE_ENV=production` and are not protected by a client key.

### Response headers

| Header    | Meaning                                                 |
| --------- | ------------------------------------------------------- |
| `X-Cache` | `HIT` if served from the proxy cache, otherwise `MISS`. |

## Errors

Errors are always JSON: `{ "error": "message" }`.

| Status | Meaning                                                                                 |
| ------ | --------------------------------------------------------------------------------------- |
| 400    | Invalid parameter or ID, or RAWG rejected the request.                                  |
| 401    | `PROXY_API_KEYS` is set and the `X-API-Key` header is missing or wrong.                 |
| 404    | Unknown route, or the resource does not exist.                                          |
| 429    | RAWG rate limit exceeded. `Retry-After` is set when RAWG sends it.                      |
| 500    | Unexpected error. Details are in the server log, not the response.                      |
| 502    | RAWG failed, returned an invalid response, or rejected the API key. See the server log. |
| 503    | The proxy's own rate limiter is saturated. `Retry-After: 1` is set.                     |
| 504    | RAWG timed out or was unreachable after all retries.                                    |

Upstream 400, 404 and 429 are passed through because the caller can act on them. Other upstream failures, including a rejected or exhausted API key, become a generic 502. The real reason is logged on the server, and the key problem is never exposed to clients.

## Caching

Successful responses are cached, so repeated requests don't cost RAWG quota.

- **Key:** the path plus the validated, alphabetically sorted parameters, for example `/games?page=1&search=zelda`. Parameter order in the client URL does not matter. The API key is never part of it.
- **What is stored:** the response body after pagination links are rewritten, so a cached entry never contains the key.
- **Errors are not cached.**
- **TTL:** `CACHE_TTL_SECONDS` (default one hour). Game metadata changes slowly, so a longer TTL is the simplest way to spend less quota.

### Drivers

| Driver   | Use when                          | Notes                                                                               |
| -------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `memory` | One instance, development         | LRU eviction at `CACHE_MAX_ENTRIES`. Lost on restart. Not shared between instances. |
| `redis`  | Several instances, or persistence | Shared by every instance. Redis expires entries itself. Set `REDIS_URL`.            |

Both drivers are **fail-open**: caching is an optimisation, never a dependency. If Redis is down, slow or returns garbage, the proxy treats it as a cache miss and serves straight from RAWG. Redis errors are logged at most once per 30 seconds per distinct message, and the client reconnects automatically.

## Reliability: de-duplication, rate limiting and retries

**In-flight de-duplication.** If ten clients request the same URL at the same moment and it isn't cached, one upstream call is made and all ten share its result.

**Local rate limiter.** A token bucket (`RATE_LIMIT_CAPACITY`, `RATE_LIMIT_REFILL_RATE`) smooths bursts toward RAWG. A request waits for a token for up to 30 seconds, then fails with `503` and `Retry-After: 1`. The defaults are conservative, not RAWG's published limits; tune them to your plan.

**Retries.** Each upstream attempt has its own timeout (`REQUEST_TIMEOUT_MS`). Network failures, timeouts, `5xx` and `429` are retried up to `MAX_RETRIES` times:

- If RAWG sends `Retry-After`, the proxy waits that long, up to 10 seconds.
- Otherwise it backs off exponentially (500 ms, 1 s, 2 s, ... capped at 8 s) with a little random jitter.

Other `4xx` responses are never retried.

## Security notes

- **The RAWG key stays server-side.** It is added to the upstream URL after the client's parameters, so a client can't override it. It is never logged (the code logs the path, not the URL) and never cached.
- **Pagination links are sanitised** so RAWG's `next` and `previous` URLs can't leak the key to clients.
- **Whitelisted parameters** mean clients can't inject arbitrary upstream parameters, and IDs are checked against a strict pattern so they can't alter the upstream path.
- **Constant-time key comparison** for client keys.
- **Secrets are not committed.** `.env` is git-ignored; only `.env.example` is tracked.
- **Headers and logging.** `helmet` sets standard security headers, `X-Powered-By` is disabled, and unexpected errors return a generic message while the details go to the server log.
- **CORS is open to all origins** by default. Restrict it (for example in `src/app.ts`) if you only serve one frontend.
- **Redis:** the URL may contain a password, so it is never logged. Use `rediss://` to encrypt the connection.

## Running in production

```bash
pnpm install
pnpm build                       # compiles to dist/ and resolves path aliases
NODE_ENV=production pnpm start   # node dist/server.js
```

A production checklist:

1. Set `NODE_ENV=production` (disables request logging and debug routes).
2. Set `RAWG_API_KEY` and a strong, random `PROXY_API_KEYS`.
3. Terminate TLS in front of the proxy (a reverse proxy or load balancer). Without HTTPS, client keys travel in clear text.
4. Use `CACHE_DRIVER=redis` if you run more than one instance.
5. Point your load balancer's health check at `GET /health`.
6. Consider a longer `CACHE_TTL_SECONDS` to reduce quota use.

### Scaling

The service is stateless apart from its cache, so scale horizontally: run several instances behind a load balancer and point them at the same Redis so they share cached responses.

Two things stay per-process and are not coordinated between instances: the token-bucket limiter and in-flight de-duplication. With N instances, the effective burst toward RAWG can be up to N times the configured limit.

### Shutdown

On `SIGTERM` or `SIGINT` the server stops accepting connections, lets in-flight requests finish, closes the cache (quitting Redis cleanly) and exits. A 10-second safety timer forces exit if something hangs.

### RAWG terms

RAWG's free plan has a monthly request limit and attribution requirements. Check <https://rawg.io/apidocs> for current terms, and make sure your use of the proxy complies with them.

## Troubleshooting

| Symptom                                                           | Cause and fix                                                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Missing required environment variable: RAWG_API_KEY` on startup  | `.env` doesn't exist (it must be named `.env`, not `.env.example`) or the key line is empty.                                                                               |
| Connection refused                                                | The server isn't running, or you're using the wrong port. Check the terminal shows `Server is up at port ...`.                                                             |
| `404 Route not found: GET /api/platforms`                         | Remove the `/api` prefix: use `/platforms`.                                                                                                                                |
| `401 Missing or invalid API key`                                  | `PROXY_API_KEYS` has a value. Send `X-API-Key: <value>`, or empty the setting and restart. A browser address bar can't send headers.                                       |
| Still `401` after setting the header                              | Restart the server after editing `.env`. Check the line is exactly `PROXY_API_KEYS=yourkey` with no quotes or spaces, and that the value matches exactly (case-sensitive). |
| `502 RAWG request failed`                                         | Usually a wrong or exhausted RAWG key. The server log shows RAWG's reason.                                                                                                 |
| `503 Proxy is saturated`                                          | Too many upstream requests at once. Raise `RATE_LIMIT_CAPACITY` / `RATE_LIMIT_REFILL_RATE`, or cache more.                                                                 |
| `504 RAWG did not respond in time`                                | RAWG was slow or unreachable. Raise `REQUEST_TIMEOUT_MS` or retry later.                                                                                                   |
| `400 Query parameter ... must be ...`                             | A parameter failed validation, for example a non-integer `page_size` or a repeated parameter.                                                                              |
| Changes to `.env` have no effect                                  | Stop the server (Ctrl+C) and start it again.                                                                                                                               |
| Redis warnings in the log                                         | Redis is unreachable. The proxy keeps working without a cache. Check `REDIS_URL`.                                                                                          |
| `Environment variable CACHE_DRIVER must be one of: memory, redis` | A typo in the setting. It is validated at startup on purpose.                                                                                                              |

To confirm the proxy itself is up, open `http://localhost:3000/health`.

## Project structure

```
src/
  app.ts                     Express app: helmet, CORS, logging, routes, 404 and error handlers
  server.ts                  Entry point, startup warning, graceful shutdown
  config/
    env.ts                   Typed, validated environment configuration
  routes/
    rawg.ts                  Route table: collections, details, game relations
    system.ts                /health and the debug routes
  controllers/
    rawg.ts                  Validates requests and sends responses
  services/
    rawg.ts                  Upstream calls: key, cache, de-dupe, limiter, retries, error mapping
  middleware/
    auth.ts                  Optional X-API-Key check
    errors.ts                JSON 404 and error handlers
  cache/
    types.ts                 Cache interface (fail-open contract)
    memory.ts                In-memory TTL + LRU driver
    redis.ts                 Redis driver
    index.ts                 createCache factory
  utils/
    deduplicate.ts           In-flight request de-duplication
    errors.ts                HttpError
    limiter.ts               Token-bucket rate limiter
    links.ts                 Rewrites RAWG pagination links
    logger.ts                Logger
    query.ts                 Parameter and ID validation
```

Responsibilities are layered: routes declare _what_ is exposed, controllers validate input, the service owns everything about talking to RAWG, and the cache sits behind an interface so drivers can be swapped without touching the service.

## Development

| Script              | What it does                                                     |
| ------------------- | ---------------------------------------------------------------- |
| `pnpm dev`          | Runs `src/server.ts` with `tsx watch`, loading `.env`.           |
| `pnpm build`        | Type-checks and compiles to `dist/`, then resolves `@/` aliases. |
| `pnpm start`        | Runs the compiled `dist/server.js`.                              |
| `pnpm format`       | Formats the project with Prettier.                               |
| `pnpm format:check` | Checks formatting without changing files.                        |

Type-check only:

```bash
pnpm exec tsc --noEmit
```

Imports use the `@/` alias for `src/`.

### Adding an endpoint

- **A new RAWG collection:** add it to `COLLECTIONS` in `src/routes/rawg.ts` with the parameter set it accepts. Its list and by-id routes are created automatically.
- **A new per-game list:** add its name to `GAME_RELATIONS` in `src/routes/rawg.ts`.
- **A new filter for `/games`:** add it to `GAMES_PARAMS` in `src/utils/query.ts` (`strings` for plain values, `booleans` for `true`/`false`).
- **A different cache backend:** implement the `Cache` interface in `src/cache/types.ts`, then select it in `src/cache/index.ts`.

## Limitations

- Read-only: only `GET` requests are proxied.
- The route list follows the RAWG documentation at the time of writing. RAWG endpoints and parameters can change; adjust the tables in `src/routes/rawg.ts` and `src/utils/query.ts` if they do.
- The rate limiter and de-duplication are per instance, and the limiter doesn't track RAWG's monthly quota.
- Pagination links are relative to the proxy; clients must prefix them with the proxy's address.
- Client authentication is a shared-secret header, not per-user identity.
- The project has no automated test suite yet.
