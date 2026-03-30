import { describe, expect, it } from 'vitest';

import { authConfig } from './config';

describe('authConfig', () => {
  it('disables better-auth sign-in email custom throttling in favor of the app route limiter', () => {
    expect(authConfig.rateLimit?.customRules?.['/sign-in/email']).toBe(false);
  });

  it('keeps global better-auth rate limiting enabled outside automated environments', () => {
    expect(authConfig.rateLimit?.window).toBe(60);
    expect(authConfig.rateLimit?.max).toBe(100);
  });
});
