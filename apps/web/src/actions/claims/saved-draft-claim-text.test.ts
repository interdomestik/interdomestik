import { createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('next-intl');
const state = vi.hoisted(() => ({ locale: 'sq' }));
const catalogs = import.meta.glob('../../messages/*/freeStart.json', {
  eager: true,
  import: 'default',
});
vi.mock('next-intl/server', () => ({
  getLocale: () => Promise.resolve(state.locale),
  getTranslations: () =>
    Promise.resolve(
      createTranslator({
        locale: state.locale,
        messages: catalogs[`../../messages/${state.locale}/freeStart.json`] as Record<
          string,
          never
        >,
        namespace: 'freeStart' as never,
      })
    ),
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
    state.locale = 'sq';
  });

  it('stores the Albanian title and labelled description the member saw', async () => {
    const text = await buildSavedDraftClaimText(FACTS, ENGLISH);
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

  it.each(['en', 'de', 'sr', 'mk'])(
    'uses the %s catalog without English option names',
    async locale => {
      state.locale = locale;
      const text = await buildSavedDraftClaimText(FACTS, ENGLISH);
      expect(text.description).toContain('QA2 Sigurues Test');
      expect(text.description.split('\n')).toHaveLength(6);
      if (locale !== 'en')
        expect(text.description).not.toMatch(/Category|Desired outcome|Parking damage/);
      if (locale === 'sr') expect(text.description).not.toMatch(/[Ѐ-ӿ]/);
    }
  );

  it('falls back to the English option name when a catalog entry is missing', async () => {
    const text = await buildSavedDraftClaimText({ ...FACTS, issueType: 'unknown_issue' }, ENGLISH);
    expect(text.title).toBe('Dëmtim i automjetit: Parking damage');
  });
});
