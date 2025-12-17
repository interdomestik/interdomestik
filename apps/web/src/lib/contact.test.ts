import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Contact Info', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default phone when env var is not set', async () => {
    delete process.env.NEXT_PUBLIC_CONTACT_PHONE;

    const { contactInfo } = await import('./contact');

    expect(contactInfo.phone).toBe('+383 49 900 600');
  });

  it('should use default whatsapp when env var is not set', async () => {
    delete process.env.NEXT_PUBLIC_CONTACT_WHATSAPP;

    const { contactInfo } = await import('./contact');

    expect(contactInfo.whatsapp).toBe('https://wa.me/38349900600');
  });

  it('should use default address when env var is not set', async () => {
    delete process.env.NEXT_PUBLIC_CONTACT_ADDRESS;

    const { contactInfo } = await import('./contact');

    expect(contactInfo.address).toBe('Prishtina, Kosovo');
  });

  it('should use default hours when env var is not set', async () => {
    delete process.env.NEXT_PUBLIC_CONTACT_HOURS;

    const { contactInfo } = await import('./contact');

    expect(contactInfo.hours).toBe('Mon–Fri, 09:00–17:00');
  });

  it('should use env var for phone when set', async () => {
    process.env.NEXT_PUBLIC_CONTACT_PHONE = '+1 555 123 4567';

    const { contactInfo } = await import('./contact');

    expect(contactInfo.phone).toBe('+1 555 123 4567');
  });

  it('should use env var for whatsapp when set', async () => {
    process.env.NEXT_PUBLIC_CONTACT_WHATSAPP = 'https://wa.me/15551234567';

    const { contactInfo } = await import('./contact');

    expect(contactInfo.whatsapp).toBe('https://wa.me/15551234567');
  });

  it('should use env var for address when set', async () => {
    process.env.NEXT_PUBLIC_CONTACT_ADDRESS = 'New York, USA';

    const { contactInfo } = await import('./contact');

    expect(contactInfo.address).toBe('New York, USA');
  });

  it('should use env var for hours when set', async () => {
    process.env.NEXT_PUBLIC_CONTACT_HOURS = '24/7';

    const { contactInfo } = await import('./contact');

    expect(contactInfo.hours).toBe('24/7');
  });
});
