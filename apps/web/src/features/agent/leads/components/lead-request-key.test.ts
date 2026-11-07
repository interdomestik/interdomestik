import { afterEach, describe, expect, it, vi } from 'vitest';

import { newLeadRequestKey } from './lead-request-key';

describe('newLeadRequestKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses randomUUID where the context provides it', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('1-2-3-4-5');
    expect(newLeadRequestKey()).toBe('1-2-3-4-5');
  });

  it('falls back to 128 random bits on a plain-HTTP origin without randomUUID', () => {
    const randomUUID = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      const first = newLeadRequestKey();
      expect(first).toMatch(/^lead-req-[0-9a-f]{32}$/);
      expect(newLeadRequestKey()).not.toBe(first);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: randomUUID,
        configurable: true,
      });
    }
  });
});
