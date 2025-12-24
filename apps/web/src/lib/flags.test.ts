import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAGS } from './flags';

describe('Feature Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should default flags to false when env vars are not set', async () => {
    delete process.env.NEXT_PUBLIC_FF_AI_ASSISTANT;
    delete process.env.NEXT_PUBLIC_FF_NPS_SURVEY;
    delete process.env.NEXT_PUBLIC_FF_NEW_PRICING;

    const { getFeatureFlag } = await import('./flags');

    expect(getFeatureFlag(FLAGS.AI_ASSISTANT)).toBe(false);
    expect(getFeatureFlag(FLAGS.NPS_SURVEY)).toBe(false);
    expect(getFeatureFlag(FLAGS.NEW_PRICING)).toBe(false);
  });

  it('should set AI_ASSISTANT to true when env var is "true"', async () => {
    process.env.NEXT_PUBLIC_FF_AI_ASSISTANT = 'true';

    const { getFeatureFlag } = await import('./flags');

    expect(getFeatureFlag(FLAGS.AI_ASSISTANT)).toBe(true);
  });

  it('should keep flag false when env var is "false"', async () => {
    process.env.NEXT_PUBLIC_FF_AI_ASSISTANT = 'false';

    const { getFeatureFlag } = await import('./flags');

    expect(getFeatureFlag(FLAGS.AI_ASSISTANT)).toBe(false);
  });
});
