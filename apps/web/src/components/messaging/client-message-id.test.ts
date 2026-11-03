import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_MESSAGE_ID_PATTERN } from '@interdomestik/domain-communications/messages/schemas';
import { createClientMessageId } from './client-message-id';

const originalCrypto = globalThis.crypto;

function withCrypto(value: Partial<Crypto>) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
}

describe('createClientMessageId', () => {
  afterEach(() => withCrypto(originalCrypto));

  it('uses crypto.randomUUID in a secure context', () => {
    withCrypto({ randomUUID: vi.fn().mockReturnValue('8f0e6a8e-3b1d-4c2a-9f7e-0c1d2e3f4a5b') });

    expect(createClientMessageId()).toBe('8f0e6a8e-3b1d-4c2a-9f7e-0c1d2e3f4a5b');
  });

  it('falls back to 128 random bits on a plain-HTTP origin', () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(buffer: T) => {
      (buffer as Uint8Array).fill(0xab);
      return buffer;
    });
    withCrypto({ getRandomValues } as Partial<Crypto>);

    const key = createClientMessageId();

    expect(key).toBe(`msg-${'ab'.repeat(16)}`);
    expect(key).toMatch(CLIENT_MESSAGE_ID_PATTERN);
  });
});
