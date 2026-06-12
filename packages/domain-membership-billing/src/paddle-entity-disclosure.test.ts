import { describe, expect, it } from 'vitest';

import { getPublicBillingEntityDisclosure } from './paddle-entity-disclosure';

describe('public billing entity disclosure', () => {
  it('exposes configured public legal disclosure and fails closed for shadow entities', () => {
    expect(getPublicBillingEntityDisclosure('ks')).toEqual({
      contractingCompany: 'Interdomestik KS LLC',
      governingLaw: 'XK',
      unavailable: false,
    });
    expect(getPublicBillingEntityDisclosure('mk')).toEqual({
      contractingCompany: 'Interdomestik MK DOOEL',
      governingLaw: 'MK',
      unavailable: false,
    });
    expect(getPublicBillingEntityDisclosure('al')).toEqual({
      contractingCompany: null,
      governingLaw: null,
      unavailable: true,
    });
  });
});
