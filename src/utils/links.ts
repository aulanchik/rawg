/**
 * RAWG list responses carry `next` and `previous` as absolute upstream URLs that echo
 * the request's `key` parameter. Handing those to a client would leak the API key and
 * point the client at RAWG instead of the proxy.
 *
 * Rewrites them to proxy-relative links (`/games?page=2`) without the key.
 * A link that can't be parsed becomes `null`: failing closed is safer than passing it on.
 */
const toProxyLink = (value: unknown, upstreamBasePath: string): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    url.searchParams.delete('key');

    const path = url.pathname.startsWith(upstreamBasePath)
      ? url.pathname.slice(upstreamBasePath.length)
      : url.pathname;

    return `${path}${url.search}`;
  } catch {
    return null;
  }
};

/**
 * @param upstreamBasePath - Path of the upstream base URL without a trailing slash,
 *   e.g. `/api` for https://api.rawg.io/api
 */
export const rewritePagination = (data: unknown, upstreamBasePath: string): unknown => {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data;
  }

  const body: Record<string, unknown> = { ...data };

  for (const field of ['next', 'previous']) {
    if (field in body) {
      body[field] = toProxyLink(body[field], upstreamBasePath);
    }
  }

  return body;
};
