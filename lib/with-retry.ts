export interface RetryOptions {
  maxAttempts?: number;      // default 3
  initialDelayMs?: number;   // default 1000
  retryOn?: (error: unknown) => boolean;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("503") ||
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("too many requests") ||
      msg.includes("service unavailable")
    );
  }
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (typeof e.status === "number" && (e.status === 429 || e.status === 503)) {
      return true;
    }
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 1000;
  const retryOn = options?.retryOn ?? isTransientError;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !retryOn(error)) {
        throw error;
      }
      // Exponential backoff: 1s → 3s → 9s
      const delayMs = initialDelayMs * Math.pow(3, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
