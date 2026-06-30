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
    expect(
      getServicesPageContactModel({ phone: '123 456', whatsapp: 'https://wa.me/38349900600' })
    ).toEqual({
      phone: '123 456',
      whatsapp: 'https://wa.me/38349900600',
      telHref: 'tel:+123456',
    });
  });

  it('getServicesPageContactModel rejects non-wa.me whatsapp links', () => {
    expect(getServicesPageContactModel({ phone: null, whatsapp: 'https://example.com' })).toEqual({
      phone: null,
      whatsapp: 'https://wa.me/38349900600',
      telHref: undefined,
    });
  });
});
