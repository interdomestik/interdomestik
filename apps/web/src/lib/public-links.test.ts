import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePublicLink, normalizeWhatsAppShareUrl } from './public-links';
import {
  stubDeploymentOrigin,
  STAGING_DOOR,
  PRODUCTION_DOOR,
} from './deployment-origin.test-support';

afterEach(() => vi.unstubAllEnvs());

describe('public destination links', () => {
  it.each([
    ['production', PRODUCTION_DOOR],
    ['staging', STAGING_DOOR],
    ['local', 'http://ida.localhost:3310'],
    ['local', 'https://ida.127.0.0.1.nip.io:3443'],
  ])('pins %s destinations across every locale and alias browser', (environment, door) => {
    stubDeploymentOrigin(environment, door);
    for (const alias of ['https://ks.interdomestik.com', 'https://mk.alias.test', door]) {
      for (const locale of ['sq', 'en', 'sr', 'mk', 'de']) {
        const path = `/${locale}/pricing?ref=ABC%2B123&token=a%2Fb#details`;
        expect(normalizePublicLink(`https://old.test${path}`, alias)).toBe(`${door}${path}`);
      }
    }
  });

  it('keeps the external WhatsApp wrapper, copy and embedded query', () => {
    stubDeploymentOrigin();
    const text = 'Join Asistenca https://ks.interdomestik.com/sq?ref=ABC%2B123&x=2';
    const share = normalizeWhatsAppShareUrl(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      'https://mk.alias.test'
    );
    expect(new URL(share).origin).toBe('https://wa.me');
    expect(new URL(share).searchParams.get('text')).toBe(
      `Join Asistenca ${STAGING_DOOR}/sq?ref=ABC%2B123&x=2`
    );
  });

  it('fails closed without a valid compiled door and rejects unsafe application URLs', () => {
    stubDeploymentOrigin();
    expect(() => normalizePublicLink('javascript:alert(1)')).toThrow();
    expect(() => normalizePublicLink('https://user:password@old.test/sq')).toThrow();
    vi.stubEnv('INTERDOMESTIK_BUILT_DEPLOY_ORIGIN', undefined);
    expect(() => normalizePublicLink('https://old.test/sq')).toThrow();
  });
});
