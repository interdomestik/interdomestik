import en from './en/accidentJourney.json';
import mk from './mk/accidentJourney.json';
import sq from './sq/accidentJourney.json';
import sr from './sr/accidentJourney.json';
import { describe, expect, it } from 'vitest';

const locales = { sq, en, sr, mk } as const;

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('accidentJourney messages', () => {
  it('keeps complete parity across SQ, EN, SR, and MK', () => {
    const expected = leafPaths(sq.accidentJourney).sort();
    for (const messages of Object.values(locales)) {
      expect(leafPaths(messages.accidentJourney).sort()).toEqual(expected);
      expect(JSON.stringify(messages.accidentJourney)).not.toMatch(
        /hapi \d+ nga|step \d+ of|ruaje dhe vazhdo|save and continue|24\/7|garant|guarantee/i
      );
    }
  });

  it('keeps the three jurisdiction roles separate in every locale', () => {
    for (const messages of Object.values(locales)) {
      const countries = messages.accidentJourney.countries;
      expect(countries.incidentLabel).not.toBe(countries.registrationLabel);
      expect(countries.registrationLabel).not.toBe(countries.counterpartyLabel);
    }
  });
});
