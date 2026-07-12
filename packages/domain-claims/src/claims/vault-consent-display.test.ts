import { describe, expect, it } from 'vitest';

import { buildVaultConsentDisplay } from './vault-consent-display';
import { input } from './vault-consent-display.test-support';

describe('buildVaultConsentDisplay gates', () => {
  it('fails closed outside the exact MK tenant', () => {
    expect(buildVaultConsentDisplay(input({ tenantCode: 'KS' }))).toEqual({ kind: 'hidden' });
    expect(buildVaultConsentDisplay(input({ tenantCountryCode: 'AL' }))).toEqual({
      kind: 'hidden',
    });
  });

  it('fails closed outside vehicle and property claims', () => {
    expect(buildVaultConsentDisplay(input({ claimCategory: 'injury' }))).toEqual({
      kind: 'hidden',
    });
  });

  it('returns an item-free neutral state for an erased subject', () => {
    const result = buildVaultConsentDisplay(input({ piiStatus: 'erased_or_unavailable' }));

    expect(result).toEqual({ kind: 'subject_erased' });
    expect('items' in result).toBe(false);
  });

  it('opens an empty safe display for an eligible claim', () => {
    expect(buildVaultConsentDisplay(input())).toEqual({ kind: 'ready', items: [] });
  });
});
