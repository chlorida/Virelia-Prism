export interface FetchWithRetryOptions extends RequestInit {
  /** Per-attempt timeout in milliseconds. */
  timeoutMs?: number;
  /** Number of attempts including the first try. */
  attempts?: number;
  /** Base delay between retries in milliseconds. */
  retryDelayMs?: number;
  /** HTTP status codes that should trigger a retry. */
  retryOnStatuses?: number[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number, retryOnStatuses: number[]): boolean {
  return retryOnStatuses.includes(status)
    || status === 408
    || status === 429
    || status >= 500;
}

/**
 * fetch with timeout, retries, and jitter for flaky VPN / high-latency links.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 25_000,
    attempts = 3,
    retryDelayMs = 1_000,
    retryOnStatuses = [],
    signal: outerSignal,
    ...init
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true });

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok && isRetryableStatus(response.status, retryOnStatuses) && attempt < attempts - 1) {
        lastError = new Error(`HTTP ${response.status}`);
        const jitter = Math.floor(Math.random() * 400);
        await sleep(retryDelayMs * (attempt + 1) + jitter);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      const jitter = Math.floor(Math.random() * 400);
      await sleep(retryDelayMs * (attempt + 1) + jitter);
    } finally {
      window.clearTimeout(timeoutId);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
