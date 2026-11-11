import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';

/**
 * A remote target (the external staging journey) sees every matrix request from one client IP,
 * so its per-IP route limits can answer a read with 429. The limits stay as they are: a read that
 * is told to wait waits for the server's Retry-After and repeats, and the test's timeout grows by
 * that wait. Only rate-limit answers with a usable Retry-After repeat; every other status, and a
 * 429 that is still answered after the bounded attempts, is returned for the caller to assert.
 */
const MAX_RATE_LIMIT_RETRIES = 4;
/** Longest wait one answer may ask for; the matrix routes use 60-second windows. */
const MAX_RETRY_AFTER_SECONDS = 65;

type GetOptions = NonNullable<Parameters<APIRequestContext['get']>[1]>;

/** Seconds from a delta-seconds Retry-After header, or null when it is absent or unusable. */
export function retryAfterSeconds(header: string | undefined): number | null {
  if (!header || !/^\d+$/.test(header.trim())) return null;
  const seconds = Number(header.trim());
  return seconds >= 1 && seconds <= MAX_RETRY_AFTER_SECONDS ? seconds : null;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** One read; a rate-limited answer with a usable Retry-After waits and becomes the next retry. */
async function readWithRetries(
  request: APIRequestContext,
  info: TestInfo,
  url: string,
  options: GetOptions | undefined,
  retry: number
): Promise<APIResponse> {
  const response = await request.get(url, options);
  if (response.status() !== 429 || retry > MAX_RATE_LIMIT_RETRIES) return response;
  const seconds = retryAfterSeconds(response.headers()['retry-after']);
  if (seconds === null) return response;
  await response.dispose();
  const waitMs = seconds * 1000;
  // A zero timeout means none; extending it would introduce one.
  if (info.timeout > 0) info.setTimeout(info.timeout + waitMs);
  info.annotations.push({
    type: 'rate-limit-wait',
    description: `${new URL(url).pathname} retry ${retry} after ${seconds}s`,
  });
  await wait(waitMs);
  return readWithRetries(request, info, url, options, retry + 1);
}

export function getRespectingRateLimit(
  request: APIRequestContext,
  info: TestInfo,
  url: string,
  options?: GetOptions
): Promise<APIResponse> {
  return readWithRetries(request, info, url, options, 1);
}
