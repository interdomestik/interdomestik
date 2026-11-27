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

const options = [
  { isActive: true, label: 'My queue + unassigned', value: 'all' },
  { isActive: true, label: 'Verification', value: 'verification' },
  { isActive: true, label: 'Diaspora / Green Card', value: 'diaspora' },
  { isActive: false, label: 'Court', value: 'court' },
];

describe('buildResultsSummary', () => {
  it('names the committed search, so equal counts still change the settled status', () => {
    const tClaims = translatorFor('en');
    const summary = (search?: string) =>
      buildResultsSummary({ count: 0, filterOptions: [], search, tClaims });

    expect(summary()).toEqual({ resultsCount: '0 claims', resultsFilters: null });
    expect(summary('Acme').resultsCount).toBe('0 claims for “Acme”');
    expect(summary('Beta').resultsCount).toBe('0 claims for “Beta”');
  });

  it('lists only the active non-default filters', () => {
    const summary = buildResultsSummary({
      count: 1,
      filterOptions: options,
      tClaims: translatorFor('en'),
    });

    expect(summary).toEqual({
      resultsCount: '1 claim',
      resultsFilters: 'Filters: Verification, Diaspora / Green Card',
    });
  });

  it.each(Object.keys(catalogs) as Array<keyof typeof catalogs>)(
    'renders the search and filters in %s',
    locale => {
      const summary = buildResultsSummary({
        count: 2,
        filterOptions: options,
        search: 'Acme',
        tClaims: translatorFor(locale),
      });

      expect(summary.resultsCount).toContain('2');
      expect(summary.resultsCount).toContain('Acme');
      expect(summary.resultsFilters).toContain('Verification');
      expect(summary.resultsFilters).toContain('Diaspora / Green Card');
    }
  );
});
