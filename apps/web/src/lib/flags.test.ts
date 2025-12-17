import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Feature Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should default all flags to false when env vars are not set', async () => {
    delete process.env.NEXT_PUBLIC_ENABLE_FLIGHT_DELAY;
    delete process.env.NEXT_PUBLIC_ENABLE_CALL_ME_NOW;
    delete process.env.NEXT_PUBLIC_ENABLE_RESPONSE_SLA;

    const { flags } = await import('./flags');

    expect(flags.flightDelay).toBe(false);
    expect(flags.callMeNow).toBe(false);
    expect(flags.responseSla).toBe(false);
  });

  it('should set flightDelay to true when env var is "true"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_FLIGHT_DELAY = 'true';

    const { flags } = await import('./flags');

    expect(flags.flightDelay).toBe(true);
  });

  it('should set callMeNow to true when env var is "true"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_CALL_ME_NOW = 'true';

    const { flags } = await import('./flags');

    expect(flags.callMeNow).toBe(true);
  });

  it('should set responseSla to true when env var is "true"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_RESPONSE_SLA = 'true';

    const { flags } = await import('./flags');

    expect(flags.responseSla).toBe(true);
  });

  it('should keep flag false when env var is any value other than "true"', async () => {
    process.env.NEXT_PUBLIC_ENABLE_FLIGHT_DELAY = 'yes';
    process.env.NEXT_PUBLIC_ENABLE_CALL_ME_NOW = '1';
    process.env.NEXT_PUBLIC_ENABLE_RESPONSE_SLA = 'false';

    const { flags } = await import('./flags');

    expect(flags.flightDelay).toBe(false);
    expect(flags.callMeNow).toBe(false);
    expect(flags.responseSla).toBe(false);
  });
});
