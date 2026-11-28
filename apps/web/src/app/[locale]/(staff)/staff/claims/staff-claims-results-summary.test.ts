import deCatalog from '@/messages/de/agent-claims.json';
import enCatalog from '@/messages/en/agent-claims.json';
import mkCatalog from '@/messages/mk/agent-claims.json';
import sqCatalog from '@/messages/sq/agent-claims.json';
import srCatalog from '@/messages/sr/agent-claims.json';
import { describe, expect, it, vi } from 'vitest';

import { buildResultsSummary } from './staff-claims-results-summary';

// The shared setup mocks next-intl; the summary is checked against the real catalogue messages.
const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
const catalogs = { de: deCatalog, en: enCatalog, mk: mkCatalog, sq: sqCatalog, sr: srCatalog };

function translatorFor(locale: keyof typeof catalogs) {
  return createTranslator({
    locale,
    messages: catalogs[locale],
    namespace: 'agent-claims.claims',
  }) as unknown as (key: string, values?: Record<string, string | number>) => string;
}

describe('buildResultsSummary', () => {
  it('names the committed search, so equal counts still change the settled status', () => {
    const tClaims = translatorFor('en');
    const summary = (search?: string) =>
      buildResultsSummary({ count: 0, filterOptions: [], search, tClaims });

    expect(summary()).toEqual({ resultsCount: '0 claims', resultsFilters: null });
    expect(summary('Acme').resultsCount).toBe('0 claims for “Acme”');
    expect(summary('Beta').resultsCount).toBe('0 claims for “Beta”');
  });

  it('names one active filter and skips default and inactive options', () => {
    const summary = buildResultsSummary({
      count: 1,
      filterOptions: [
        { isActive: true, label: 'My queue + unassigned', value: 'all' },
        { isActive: true, label: 'Verification', value: 'verification' },
        { isActive: false, label: 'Court', value: 'court' },
      ],
      tClaims: translatorFor('en'),
    });

    expect(summary).toEqual({
      resultsCount: '1 claim',
      resultsFilters: 'Filters: Verification',
    });
  });

  it.each([
    ['de', '2 Fälle für „Acme“', 'Filter: Nicht zugewiesen und Diaspora / Grüne Karte'],
    ['en', '2 claims for “Acme”', 'Filters: Unassigned and Diaspora / Green Card'],
    ['mk', '2 барања за „Acme“', 'Филтри: Недоделено и Дијаспора / Зелен картон'],
    ['sq', '2 raste për “Acme”', 'Filtrat: Pa përgjegjës dhe Diaspora / Kartoni i Gjelbër'],
    ['sr', '2 zahteva za „Acme“', 'Filteri: Nedodeljeno i Dijaspora / Zeleni karton'],
  ] as const)(
    'renders the search and two filters in %s',
    (locale, resultsCount, resultsFilters) => {
      const queue = catalogs[locale]['agent-claims'].claims.staff_queue;
      const summary = buildResultsSummary({
        count: 2,
        filterOptions: [
          { isActive: true, label: queue.assignment_state.unassigned, value: 'unassigned' },
          { isActive: true, label: queue.diaspora_filter.diaspora, value: 'diaspora' },
        ],
        search: 'Acme',
        tClaims: translatorFor(locale),
      });

      expect(summary).toEqual({ resultsCount, resultsFilters });
    }
  );
});
