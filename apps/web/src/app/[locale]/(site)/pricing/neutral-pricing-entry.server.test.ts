import { describe, expect, it } from 'vitest';

import {
  buildNeutralPricingEntryUrl,
  parseNeutralPricingPlan,
} from './neutral-pricing-entry.server';

describe('neutral pricing entry', () => {
  it('C27 pins every locale to the explicitly configured deployment door', () => {
    for (const [environment, origin] of [
      ['production', 'https://ida.interdomestik.com'],
      ['staging', 'https://staging.interdomestik.com'],
      ['local', 'http://ida.localhost:3310'],
      ['local', 'https://ida.127.0.0.1.nip.io:3443'],
    ]) {
      const env = {
        INTERDOMESTIK_DEPLOY_ENV: environment,
        NEXT_PUBLIC_APP_URL: origin,
        BETTER_AUTH_URL: origin,
        IDA_HOST: new URL(origin!).host,
      };
      for (const locale of ['sq', 'en', 'sr', 'mk', 'de']) {
        expect(buildNeutralPricingEntryUrl(locale, env)).toBe(`${origin}/${locale}/pricing`);
      }
    }
    expect(() => buildNeutralPricingEntryUrl('sq', {})).toThrow();
    expect(() => buildNeutralPricingEntryUrl('https://evil.test', {})).toThrow(
      'invalid_pricing_locale'
    );
  });

  it('C28 accepts only one exact self-serve plan key and neutralizes every other input', () => {
    expect(parseNeutralPricingPlan({ plan: 'standard' })).toBe('standard');
    expect(parseNeutralPricingPlan({ plan: 'family' })).toBe('family');

    for (const input of [
      undefined,
      {},
      { plan: 'business' },
      { plan: ['standard', 'family'] },
      { plan: 'STANDARD' },
      { plan: ' standard' },
      { plan: 'family ' },
      { plan: `standard${'x'.repeat(80)}` },
      { plan: 'standard&tenantId=tenant_mk' },
      { plan: 'standard', tenantId: 'tenant_mk' },
      { plan: 'family', entry: 'register' },
      { entry: 'register' },
    ]) {
      expect(parseNeutralPricingPlan(input)).toBeNull();
    }
  });
});
