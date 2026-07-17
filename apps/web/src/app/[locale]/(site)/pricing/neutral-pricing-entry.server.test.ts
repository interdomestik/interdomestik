import { describe, expect, it } from 'vitest';

import {
  buildNeutralPricingEntryUrl,
  parseNeutralPricingPlan,
} from './neutral-pricing-entry.server';

describe('neutral pricing entry', () => {
  it('C27 pins the locale path to canonical, configured or local IDA and rejects unsafe config', () => {
    expect(buildNeutralPricingEntryUrl('sq', {})).toBe('https://ida.interdomestik.com/sq/pricing');
    expect(buildNeutralPricingEntryUrl('en', { IDA_HOST: 'https://ida.example.test:8443' })).toBe(
      'https://ida.example.test:8443/en/pricing'
    );
    for (const appOrigin of ['http://127.0.0.1:3000', 'http://ks.localhost:3000']) {
      expect(buildNeutralPricingEntryUrl('sr', { NEXT_PUBLIC_APP_URL: appOrigin })).toBe(
        'http://ida.localhost:3000/sr/pricing'
      );
    }
    expect(
      buildNeutralPricingEntryUrl('mk', {
        IDA_HOST: 'ida.127.0.0.1.nip.io:3000',
        HOST: 'evil.example',
        X_FORWARDED_HOST: 'evil.example',
      })
    ).toBe('http://ida.127.0.0.1.nip.io:3000/mk/pricing');

    for (const IDA_HOST of [
      '//evil.example',
      'javascript:alert(1)',
      'http://example.com',
      'https://user:secret@ida.example.test',
      'https://ida.example.test/path',
      'https://ida.example.test?next=https://evil.example',
      'https://ida.example.test#fragment',
    ]) {
      expect(() => buildNeutralPricingEntryUrl('sq', { IDA_HOST })).toThrow('invalid_ida_host');
    }
    expect(() => buildNeutralPricingEntryUrl('https://evil.example', {})).toThrow(
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
