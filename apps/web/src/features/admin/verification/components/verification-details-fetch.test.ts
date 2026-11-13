import { describe, expect, it, vi } from 'vitest';
import { fetchVerificationDetails } from './verification-details-fetch';

function response(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('fetchVerificationDetails', () => {
  it('returns the details for a known attempt', async () => {
    const fetchFn = vi.fn(() => response(200, { id: 'attempt-1', status: 'pending' }));
    await expect(fetchVerificationDetails('attempt-1', fetchFn)).resolves.toEqual({
      kind: 'ok',
      data: { id: 'attempt-1', status: 'pending' },
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/verification/attempt-1');
  });

  it('reports an unknown attempt as not found instead of an error', async () => {
    const fetchFn = vi.fn(() => response(404, { error: 'Not found' }));
    await expect(fetchVerificationDetails('qa2-nonexistent', fetchFn)).resolves.toEqual({
      kind: 'not_found',
    });
  });

  it.each([
    ['a forbidden response', () => response(403, { error: 'Forbidden' })],
    ['a server error', () => response(500, { error: 'Internal server error' })],
    ['an error body on 200', () => response(200, { error: 'boom' })],
    ['a network failure', () => Promise.reject(new Error('offline'))],
  ])('reports %s as an error', async (_label, impl) => {
    await expect(fetchVerificationDetails('attempt-1', vi.fn(impl))).resolves.toEqual({
      kind: 'error',
    });
  });

  it('encodes the id into a single path segment', async () => {
    const fetchFn = vi.fn(() => response(404, {}));
    await fetchVerificationDetails('a/../b', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/api/verification/a%2F..%2Fb');
  });
});
