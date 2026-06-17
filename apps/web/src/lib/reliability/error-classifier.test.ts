import { describe, expect, it } from 'vitest';

import { classifyRetryError } from './error-classifier';

describe('classifyRetryError', () => {
  it.each([
    [Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }), 'transient', true],
    [Object.assign(new Error('storage failed'), { cause: { statusCode: 503 } }), 'transient', true],
    [Object.assign(new Error('deadlock detected'), { code: '40P01' }), 'transient', true],
    [Object.assign(new Error('no object'), { cause: { statusCode: 404 } }), 'permanent', false],
    [new Error('Queued policy analysis run run-1 was not found.'), 'permanent', false],
    [Object.assign(new Error('bad tenant'), { name: 'TenantStoragePathError' }), 'auth', false],
    [Object.assign(new Error('forbidden'), { status: 403 }), 'auth', false],
    [Object.assign(new Error('quota exceeded'), { status: 429 }), 'quota', true],
    [Object.assign(new Error('invalid payload'), { name: 'ZodError' }), 'validation', false],
    [new Error('business rule failed'), 'unknown', false],
  ] as const)('classifies %s as %s', (error, kind, retryable) => {
    expect(classifyRetryError(error)).toMatchObject({ kind, retryable });
  });

  it('extracts retry-after from quota errors', () => {
    const error = Object.assign(new Error('rate limit'), {
      headers: { 'retry-after': '2' },
      status: 429,
    });

    expect(classifyRetryError(error)).toMatchObject({
      kind: 'quota',
      retryAfterMs: 2_000,
      retryable: true,
    });
  });

  it('treats explicit retryAfterMs values as milliseconds', () => {
    const error = Object.assign(new Error('rate limit'), {
      retryAfterMs: 1_000,
      status: 429,
    });

    expect(classifyRetryError(error)).toMatchObject({
      kind: 'quota',
      retryAfterMs: 1_000,
      retryable: true,
    });
  });
});
