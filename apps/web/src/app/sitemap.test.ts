import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/i18n/locales';

import sitemap from './sitemap';

const BASE_URL = 'https://interdomestikasistenca.com';
const LOCALE_APP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '[locale]');

/** Public paths served by a page.tsx under app/[locale], with route groups removed. */
function localePageRoutes(dir = LOCALE_APP_DIR, segments: string[] = []): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isFile()) return entry.name === 'page.tsx' ? [`/${segments.join('/')}`] : [];
    if (!entry.isDirectory()) return [];
    const isGroup = /^\(.+\)$/u.test(entry.name);
    return localePageRoutes(
      path.join(dir, entry.name),
      isGroup ? segments : [...segments, entry.name]
    );
  });
}

function routeOf(url: string): { locale: string; route: string } {
  const [, locale = '', ...rest] = new URL(url).pathname.split('/');
  return { locale, route: `/${rest.join('/')}` };
}

describe('sitemap', () => {
  const entries = sitemap();
  const pageRoutes = new Set(localePageRoutes());

  it('lists only paths that have a page under app/[locale]', () => {
    expect(pageRoutes.has('/')).toBe(true);
    for (const entry of entries) {
      const destinations = [entry.url, ...Object.values(entry.alternates?.languages ?? {})];
      for (const destination of destinations) {
        const { locale, route } = routeOf(String(destination));
        expect(LOCALES, String(destination)).toContain(locale);
        expect(pageRoutes.has(route), `${destination} has no page.tsx`).toBe(true);
      }
    }
  });

  it('does not list the retired contact and faq paths', () => {
    expect(entries.some(entry => /\/(?:contact|faq)$/u.test(entry.url))).toBe(false);
  });

  it('lists every sitemap path once per routed locale, German included', () => {
    const routes = new Set(entries.map(entry => routeOf(entry.url).route));
    expect(entries).toHaveLength(LOCALES.length * routes.size);
    expect(entries.map(entry => entry.url)).toContain(`${BASE_URL}/de/pricing`);
  });

  it('gives every entry reciprocal language alternates for all locales', () => {
    const urls = new Set(entries.map(entry => entry.url));

    for (const entry of entries) {
      const languages = entry.alternates?.languages ?? {};
      expect(Object.keys(languages).sort()).toEqual([...LOCALES].sort());
      const { route } = routeOf(entry.url);
      for (const [locale, alternate] of Object.entries(languages)) {
        expect(routeOf(String(alternate))).toEqual({ locale, route });
        expect(urls.has(String(alternate))).toBe(true);
        const counterpart = entries.find(candidate => candidate.url === alternate);
        expect(Object.values(counterpart?.alternates?.languages ?? {})).toContain(entry.url);
      }
    }
  });
});
