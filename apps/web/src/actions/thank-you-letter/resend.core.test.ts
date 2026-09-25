import { describe, expect, it } from 'vitest';
import { resendWelcomeEmailCore } from './resend.core';

describe('resendWelcomeEmailCore', () => {
  it('does not reconstruct a confirmation from mutable or fallback values', async () => {
    await expect(resendWelcomeEmailCore('member-1')).resolves.toEqual({
      success: false,
      error:
        'Provider-backed membership confirmations cannot be resent until an immutable confirmation snapshot is stored.',
    });
  });
});
