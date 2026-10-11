/**
 * An error that maps directly to an HTTP response.
 * `retryAfter` (seconds) is forwarded as a Retry-After header when present.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
