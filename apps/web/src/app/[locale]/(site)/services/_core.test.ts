import { describe, expect, it } from 'vitest';

import { buildTelHref, getServicesPageContactModel } from './_core';

describe('services page core', () => {
  it('buildTelHref returns undefined for empty phone', () => {
    expect(buildTelHref(undefined)).toBeUndefined();
    expect(buildTelHref(null)).toBeUndefined();
    expect(buildTelHref('')).toBeUndefined();
  });

  it('buildTelHref falls back for numbers outside the support allowlist', () => {
    expect(buildTelHref('+1 234  567')).toBe('tel:+38349900600');
  });

  it('buildTelHref keeps allowed MK support numbers', () => {
    expect(buildTelHref('+389 70 337 140')).toBe('tel:+38970337140');
  });

  it('getServicesPageContactModel normalizes nulls and computes telHref', () => {
    expect(
      getServicesPageContactModel({ phone: '123 456', whatsapp: 'https://wa.me/38349900600' })
    ).toEqual({
      phone: '123 456',
      whatsapp: 'https://wa.me/38349900600',
      telHref: 'tel:+38349900600',
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
