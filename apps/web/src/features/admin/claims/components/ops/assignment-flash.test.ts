import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeAssignmentFlash, rememberAssignmentFlash } from './assignment-flash';

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.sessionStorage.clear();
});

describe('assignment flash', () => {
  it('is consumed exactly once and only by the same claim', () => {
    expect(rememberAssignmentFlash('claim-1')).toBe(true);
    expect(consumeAssignmentFlash('claim-2')).toBe(false);
    expect(consumeAssignmentFlash('claim-1')).toBe(true);
    expect(consumeAssignmentFlash('claim-1')).toBe(false);
  });

  it('degrades to false when session storage is blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    });
    expect(rememberAssignmentFlash('claim-1')).toBe(false);
    expect(consumeAssignmentFlash('claim-1')).toBe(false);
  });
});
