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

  it.each(['injury', 'medical', 'travel', 'unknown'])('fails closed for %s claims', category => {
    expect(buildVaultConsentDisplay(input({ claimCategory: category }))).toEqual({
      kind: 'hidden',
    });
  });

  it('returns an item-free neutral state for an erased subject', () => {
    const result = buildVaultConsentDisplay(input({ piiStatus: 'erased_or_unavailable' }));

    expect(result).toEqual({ kind: 'subject_erased' });
    expect('items' in result).toBe(false);
  });

  it.each(['vehicle', 'property'])(
    'opens an empty safe display for an eligible %s claim',
    category => {
      expect(buildVaultConsentDisplay(input({ claimCategory: category }))).toEqual({
        kind: 'ready',
        items: [],
      });
    }
  );
});
