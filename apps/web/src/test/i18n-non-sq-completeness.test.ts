import enCommon from '@/messages/en/common.json';
import mkCommon from '@/messages/mk/common.json';
import sqCommon from '@/messages/sq/common.json';
import srCommon from '@/messages/sr/common.json';
import { describe, expect, it } from 'vitest';

describe('Non-SQ locale completeness', () => {
  const requiredCommonKeys = ['unassigned', 'no_results'] as const;
  const locales = [
    ['en', enCommon.common],
    ['mk', mkCommon.common],
    ['sq', sqCommon.common],
    ['sr', srCommon.common],
  ] as const;

  it('keeps shared common queue labels available in every pilot locale', () => {
    for (const [locale, common] of locales) {
      for (const key of requiredCommonKeys) {
        expect(common).toHaveProperty(key);
        expect(common[key]).toBeTruthy();
      }
    }
  });
});
