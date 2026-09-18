import enCommon from '@/messages/en/common.json';
import enDiaspora from '@/messages/en/diaspora.json';
import mkCommon from '@/messages/mk/common.json';
import mkDiaspora from '@/messages/mk/diaspora.json';
import sqDiaspora from '@/messages/sq/diaspora.json';
import srCommon from '@/messages/sr/common.json';
import srDiaspora from '@/messages/sr/diaspora.json';
import { COUNTRY_CODES } from '@interdomestik/domain-country-guidance';
import { describe, expect, it } from 'vitest';

describe('Non-SQ locale completeness', () => {
  const requiredCommonKeys = ['unassigned', 'no_results'] as const;
  const locales = [
    ['en', enCommon.common],
    ['mk', mkCommon.common],
    ['sr', srCommon.common],
  ] as const;

  it('keeps shared common queue labels available in every non-sq pilot locale', () => {
    for (const [, common] of locales) {
      for (const key of requiredCommonKeys) {
        expect(common).toHaveProperty(key);
        expect(common[key]).toBeTruthy();
      }
    }
  });

  it('keeps every corridor catalog aligned with the typed country and copy contract', () => {
    const expectedKeys = [
      'addTransit',
      'apply',
      'chooseCountry',
      'destination',
      'options',
      'origin',
      'preparationOnly',
      'removeTransit',
      'summaryTitle',
      'title',
      'transit',
      'transitGroup',
      'transitHint',
    ].sort();

    for (const messages of [enDiaspora, sqDiaspora, mkDiaspora, srDiaspora]) {
      const copy = messages.diaspora.corridor;
      expect(Object.keys(copy).sort()).toEqual(expectedKeys);
      expect(Object.keys(copy.options).sort()).toEqual([...COUNTRY_CODES].sort());
      expect(copy.transit).toContain('{position}');
      expect(copy.removeTransit).toContain('{position}');
    }
  });
});
