const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `operation` once per key at a time: callers that arrive while the same key
 * is already in flight share its promise instead of starting another upstream call.
 */
export function deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);

  if (existing) {
    return existing as Promise<T>;
  }

  const promise = operation().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);

  return promise;
}

/** Number of upstream requests currently in flight (for the debug route). */
export function getInFlightCount(): number {
  return inFlight.size;
}
