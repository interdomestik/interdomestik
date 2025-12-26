import { describe, expect, it } from 'vitest';

import { buildTelHref, getServicesPageContactModel } from './_core';

describe('services page core', () => {
  it('buildTelHref returns undefined for empty phone', () => {
    expect(buildTelHref(undefined)).toBeUndefined();
    expect(buildTelHref(null)).toBeUndefined();
    expect(buildTelHref('')).toBeUndefined();
  });

  it('buildTelHref strips whitespace', () => {
    expect(buildTelHref('+1 234  567')).toBe('tel:+1234567');
  });

  it('getServicesPageContactModel normalizes nulls and computes telHref', () => {
    expect(getServicesPageContactModel({ phone: '123 456', whatsapp: null })).toEqual({
      phone: '123 456',
      whatsapp: null,
      telHref: 'tel:123456',
    });
  });
});
