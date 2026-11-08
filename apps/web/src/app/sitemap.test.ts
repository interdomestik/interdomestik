import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/i18n/locales';

import sitemap from './sitemap';

const BASE_URL = 'https://interdomestikasistenca.com';
const ROUTES = ['', '/pricing', '/services', '/contact', '/faq'];

describe('sitemap', () => {
  const entries = sitemap();

  it('lists every public route once per locale, German included', () => {
    expect(entries).toHaveLength(LOCALES.length * ROUTES.length);
    expect(entries.map(entry => entry.url)).toContain(`${BASE_URL}/de/pricing`);
  });

  it('gives every entry reciprocal language alternates for all locales', () => {
    const urls = new Set(entries.map(entry => entry.url));

    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      expect(Object.keys(languages).sort()).toEqual([...LOCALES].sort());
      const route = entry.url.slice(BASE_URL.length).replace(/^\/[a-z]{2}/u, '');
      for (const [locale, alternate] of Object.entries(languages)) {
        expect(alternate).toBe(`${BASE_URL}/${locale}${route}`);
        expect(urls.has(String(alternate))).toBe(true);
        const counterpart = entries.find(candidate => candidate.url === alternate);
        expect(Object.values(counterpart?.alternates?.languages ?? {})).toContain(entry.url);
      }
    }
  });

  it('points German and English pages at each other', () => {
    const german = entries.find(entry => entry.url === `${BASE_URL}/de/faq`);
    expect(german?.alternates?.languages).toMatchObject({
      de: `${BASE_URL}/de/faq`,
      en: `${BASE_URL}/en/faq`,
    });
  });
});
