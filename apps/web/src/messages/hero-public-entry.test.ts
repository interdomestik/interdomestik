import en from './en/hero.json';
import mk from './mk/hero.json';
import sq from './sq/hero.json';
import sr from './sr/hero.json';
import { describe, expect, it } from 'vitest';

const locales = { sq, en, sr, mk } as const;
const requiredKeys = [
  'eyebrow',
  'title',
  'subtitle',
  'membershipLabel',
  'utilityPrompt',
  'helpNowTitle',
  'helpNowDescription',
  'caseTitle',
  'caseDescription',
  'memberEyebrow',
  'memberTitle',
  'memberSubtitle',
  'memberPrimary',
  'memberSecondary',
] as const;

describe('hero.publicEntry messages', () => {
  it.each(Object.entries(locales))('%s has the complete public-entry contract', (_, messages) => {
    const publicEntry = messages.hero.publicEntry;

    expect(Object.keys(publicEntry).sort()).toEqual([...requiredKeys].sort());
    for (const key of requiredKeys) {
      expect(publicEntry[key].trim()).not.toBe('');
    }
  });

  it('keeps unsupported quantitative and guarantee claims out of the new hero copy', () => {
    const forbidden = /4\.9|8[.,]500|100\s?%|24\/7|guarantee|guaranteed|garant|без успех/i;

    for (const messages of Object.values(locales)) {
      expect(JSON.stringify(messages.hero.publicEntry)).not.toMatch(forbidden);
    }
  });
});
