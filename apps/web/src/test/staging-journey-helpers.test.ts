import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogueDelivery } from '../../e2e/gate/catalogue-delivery';
import { getRespectingRateLimit, retryAfterSeconds } from '../../e2e/gate/rate-limit-aware-get';

const configured: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  NEXT_PUBLIC_SUPABASE_URL: 'https://storage.example.invalid',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
};

describe('catalogue document delivery', () => {
  it('requires stored bytes on the external staging journey, never a skip', () => {
    expect(catalogueDelivery({ NODE_ENV: 'test', PW_EXTERNAL_SERVER: '1' })).toBe('storage-signed');
    expect(catalogueDelivery({ ...configured, PW_EXTERNAL_SERVER: '1' })).toBe('storage-signed');
  });
  it('proves the managed local server through the authenticated proxy', () => {
    expect(catalogueDelivery({ NODE_ENV: 'test' })).toBe('authenticated-proxy');
  });
  it('marks local configured storage as unavailable for the row-only seed', () => {
    expect(catalogueDelivery(configured)).toBe('unavailable');
  });
});

describe('retryAfterSeconds', () => {
  it.each([
    ['17', 17],
    [' 1 ', 1],
    ['65', 65],
  ])('reads delta seconds %s', (header, seconds) => {
    expect(retryAfterSeconds(header)).toBe(seconds);
  });
  it.each([undefined, '', '0', '66', '-3', '2.5', 'Wed, 21 Oct 2026 07:28:00 GMT'])(
    'refuses unusable value %s',
    header => {
      expect(retryAfterSeconds(header)).toBeNull();
    }
  );
});

function response(status: number, headers: Record<string, string> = {}): APIResponse {
  return {
    status: () => status,
    headers: () => headers,
    dispose: vi.fn(() => Promise.resolve()),
  } as unknown as APIResponse;
}

function harness(responses: APIResponse[]) {
  const get = vi.fn(() => Promise.resolve(responses.shift() as APIResponse));
  const info = { timeout: 120_000, setTimeout: vi.fn(), annotations: [] } as unknown as TestInfo;
  return { request: { get } as unknown as APIRequestContext, get, info };
}

const URL_UNDER_TEST = 'https://staging.example.invalid/api/claims?page=1';

describe('getRespectingRateLimit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for Retry-After, extends the timeout and repeats the read', async () => {
    vi.useFakeTimers();
    const { request, get, info } = harness([response(429, { 'retry-after': '3' }), response(200)]);
    const pending = getRespectingRateLimit(request, info, URL_UNDER_TEST, { maxRedirects: 0 });
    await vi.advanceTimersByTimeAsync(3000);
    const result = await pending;
    expect(result.status()).toBe(200);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith(URL_UNDER_TEST, { maxRedirects: 0 });
    expect(info.setTimeout).toHaveBeenCalledWith(123_000);
    expect(info.annotations).toEqual([
      { type: 'rate-limit-wait', description: '/api/claims retry 1 after 3s' },
    ]);
  });

  it('returns other statuses untouched', async () => {
    const { request, get } = harness([response(500)]);
    const { info } = harness([]);
    expect((await getRespectingRateLimit(request, info, URL_UNDER_TEST)).status()).toBe(500);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns a 429 without a usable Retry-After for the caller to fail', async () => {
    const { request, get, info } = harness([response(429)]);
    expect((await getRespectingRateLimit(request, info, URL_UNDER_TEST)).status()).toBe(429);
    expect(get).toHaveBeenCalledTimes(1);
    expect(info.setTimeout).not.toHaveBeenCalled();
  });

  it('stops after the bounded retries and returns the last 429', async () => {
    vi.useFakeTimers();
    const limited = () => response(429, { 'retry-after': '1' });
    const { request, get, info } = harness([1, 2, 3, 4, 5, 6].map(limited));
    const pending = getRespectingRateLimit(request, info, URL_UNDER_TEST);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status()).toBe(429);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it('never introduces a timeout when the test has none', async () => {
    vi.useFakeTimers();
    const { request, info } = harness([response(429, { 'retry-after': '1' }), response(200)]);
    (info as { timeout: number }).timeout = 0;
    const pending = getRespectingRateLimit(request, info, URL_UNDER_TEST);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).status()).toBe(200);
    expect(info.setTimeout).not.toHaveBeenCalled();
  });
});
