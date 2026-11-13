import { createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('next-intl');
const catalogs = import.meta.glob('../../messages/*/freeStart.json', {
  eager: true,
  import: 'default',
});
const requested = vi.hoisted(() => ({ locales: [] as string[] }));
// Only an explicit locale is honoured: the action never asks next-intl for an implicit one.
vi.mock('next-intl/server', () => ({
  getLocale: () => Promise.reject(new Error('implicit getLocale() is not allowed in actions')),
  getTranslations: ({ locale }: { locale: string }) => {
    requested.locales.push(locale);
    return Promise.resolve(
      createTranslator({
        locale,
        messages: catalogs[`../../messages/${locale}/freeStart.json`] as Record<string, never>,
        namespace: 'freeStart' as never,
      })
    );
  },
}));

import { buildSavedDraftClaimText } from './saved-draft-claim-text';

const FACTS = {
  category: 'vehicle',
  issueType: 'parking_damage',
  incidentDate: '2026-11-10',
  counterparty: 'QA2 Sigurues Test',
  desiredOutcome: 'repair',
  summary: 'QA2 goditje në parking.',
} as const;
const ENGLISH = { category: 'Vehicle', issue: 'Parking damage', outcome: 'Repair' } as const;

describe('buildSavedDraftClaimText', () => {
  beforeEach(() => {
    requested.locales = [];
  });

  it('stores the Albanian title and labelled description the member saw', async () => {
    const text = await buildSavedDraftClaimText(FACTS, ENGLISH, 'sq');
    expect(text.title).toBe('Dëmtim i automjetit: Dëmtim në parking ose goditje pa autor');
    expect(text.description.split('\n')).toEqual([
      'Lloji i rastit: Dëmtim i automjetit',
      'Problemi: Dëmtim në parking ose goditje pa autor',
      'Data e incidentit: 10.11.2026',
      'Pala tjetër: QA2 Sigurues Test',
      'Rezultati i kërkuar: Kosto riparimi ose zëvendësimi',
      'Përmbledhja: QA2 goditje në parking.',
    ]);
  });

  it.each(['en', 'de', 'sr', 'mk'] as const)(
    'uses the %s catalog without English option names',
    async locale => {
      const text = await buildSavedDraftClaimText(FACTS, ENGLISH, locale);
      expect(requested.locales).toEqual([locale]);
      expect(text.description).toContain('QA2 Sigurues Test');
      expect(text.description.split('\n')).toHaveLength(6);
      if (locale !== 'en')
        expect(text.description).not.toMatch(/Category|Desired outcome|Parking damage/);
      if (locale === 'sr') expect(text.description).not.toMatch(/[Ѐ-ӿ]/);
    }
  );

  it('falls back to the English option name when a catalog entry is missing', async () => {
    const text = await buildSavedDraftClaimText(
      { ...FACTS, issueType: 'unknown_issue' },
      ENGLISH,
      'sq'
    );
    expect(text.title).toBe('Dëmtim i automjetit: Parking damage');
  });
});
