import { describe, expect, it } from 'vitest';

import { shouldEnablePosthog } from './posthog-provider';

describe('shouldEnablePosthog', () => {
  it('disables analytics on local nip.io hosts during production-like local verification', () => {
    expect(
      shouldEnablePosthog({
        nodeEnv: 'production',
        hostname: 'ks.127.0.0.1.nip.io',
        posthogKey: 'ph_test',
        posthogHost: 'https://us.i.posthog.com',
      })
    ).toBe(false);
  });

  it('enables analytics on non-local production hosts when configured', () => {
    expect(
      shouldEnablePosthog({
        nodeEnv: 'production',
        hostname: 'pilot.interdomestik.com',
        posthogKey: 'ph_test',
        posthogHost: 'https://us.i.posthog.com',
      })
    ).toBe(true);
  });

  it('allows an explicit enable flag to override local-host suppression', () => {
    expect(
      shouldEnablePosthog({
        nodeEnv: 'production',
        hostname: 'mk.127.0.0.1.nip.io',
        enableAnalytics: 'true',
        posthogKey: 'ph_test',
        posthogHost: 'https://us.i.posthog.com',
      })
    ).toBe(true);
  });
});
