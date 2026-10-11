/**
 * Token-bucket rate limiter. Smooths bursts of upstream calls from this process.
 * It does not track RAWG's monthly quota and is not shared between instances.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  /**
   * @param capacity - Max tokens in the bucket (the largest burst)
   * @param refillRate - Tokens added per second
   */
  constructor(
    private readonly capacity: number,
    private readonly refillRate: number,
  ) {
    this.tokens = capacity;
  }

  /**
   * Waits until a token is available, then consumes it.
   * @throws Error when the wait would exceed `timeoutMs`
   */
  async acquire(timeoutMs = 30_000): Promise<void> {
    const startedAt = Date.now();

    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;

      if (Date.now() - startedAt + waitMs > timeoutMs) {
        throw new Error(`Rate limit timeout: would wait more than ${timeoutMs}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs + 10));
    }
  }

  getStatus(): { availableTokens: number; capacity: number } {
    this.refill();
    return { availableTokens: Math.floor(this.tokens), capacity: this.capacity };
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;

    this.tokens = Math.min(this.tokens + elapsedSeconds * this.refillRate, this.capacity);
    this.lastRefill = now;
  }
}
