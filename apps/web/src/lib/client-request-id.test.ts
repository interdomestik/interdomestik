import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClientRequestId } from './client-request-id';

const originalCrypto = globalThis.crypto;

describe('createClientRequestId', () => {
  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
    vi.restoreAllMocks();
  });

  it('uses crypto.randomUUID when available', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: vi.fn().mockReturnValue('uuid-from-crypto'),
      },
    });

    expect(createClientRequestId()).toBe('uuid-from-crypto');
  });

  it('falls back to a generated request id when randomUUID is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: vi.fn((buffer: Uint8Array) => {
          buffer.set([0, 1, 2, 3]);
          return buffer;
        }),
      },
    });

    const id = createClientRequestId();

    expect(globalThis.crypto?.getRandomValues).toHaveBeenCalledOnce();
    expect(id).toBe('req_00010203');
  });
});
