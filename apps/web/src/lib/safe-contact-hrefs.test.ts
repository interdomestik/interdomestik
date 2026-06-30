import { describe, expect, it } from 'vitest';

import {
  buildSafeTelHref,
  buildSafeWhatsappHref,
  formatSafeContactPhone,
  normalizeE164Phone,
  resolveSafeContactPhone,
} from './safe-contact-hrefs';

describe('safe contact hrefs', () => {
  it('normalizes phone numbers to E.164 digits only', () => {
    expect(normalizeE164Phone('+383 49 900 600')).toBe('+38349900600');
    expect(normalizeE164Phone('383-49-900-600')).toBe('+38349900600');
  });

  it('falls back when phone input cannot produce a safe tel href', () => {
    expect(buildSafeTelHref('javascript:alert(1)')).toBe('tel:+38349900600');
    expect(buildSafeTelHref('+12')).toBe('tel:+38349900600');
  });

  it('resolves display and href inputs to the same allowed public phone', () => {
    const phone = resolveSafeContactPhone('+1 555 123 4567');

    expect(phone).toBe('+38349900600');
    expect(formatSafeContactPhone(phone)).toBe('+383 49 900 600');
    expect(buildSafeTelHref(phone)).toBe('tel:+38349900600');
  });

  it('allows only wa.me HTTPS WhatsApp hrefs without query or hash', () => {
    expect(buildSafeWhatsappHref('https://wa.me/38349900600')).toBe('https://wa.me/38349900600');
    expect(buildSafeWhatsappHref('https://evil.example/38349900600')).toBe(
      'https://wa.me/38349900600'
    );
  });
});
