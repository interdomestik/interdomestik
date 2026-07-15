import { describe, expect, it } from 'vitest';

import en from './en/freeStart.json';
import mk from './mk/freeStart.json';
import sq from './sq/freeStart.json';
import sr from './sr/freeStart.json';

const localeMessages = { en, mk, sq, sr } as const;

function collectCopyValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];

  return Object.values(value).flatMap(collectCopyValues);
}

describe('premium Free Start copy contract', () => {
  it.each(Object.entries(localeMessages))(
    '%s states that the summary is temporary, unsaved and does not open a case',
    (_locale, messages) => {
      const boundary = messages.freeStart.trustBoundary;

      expect(boundary.heading.trim()).not.toHaveLength(0);
      expect(boundary.body.trim()).not.toHaveLength(0);
      expect(boundary.body).toMatch(/temporary|përkohshme|privremen|привремен/i);
      expect(boundary.body).toMatch(/not saved|nuk është ruajtur|nije sačuvan|не се зачувува/i);
      expect(boundary.body).toMatch(/no case|nuk është hapur|nije otvoren|не е отворен/i);
    }
  );

  it('keeps the same premium organizer keys in every locale', () => {
    const keys = Object.values(localeMessages).map(messages =>
      Object.keys(messages.freeStart.selectedSituation).sort()
    );

    expect(keys).toEqual([keys[0], keys[0], keys[0], keys[0]]);
  });

  it.each(Object.entries(localeMessages))(
    '%s uses plain-language review copy instead of public triage jargon',
    (_locale, messages) => {
      const publicCopy = collectCopyValues(messages.freeStart).join(' ');

      expect(publicCopy).not.toMatch(/triage|triage-u|trija[zž]|trijaža|тријаж/i);
    }
  );

  it('keeps internal intake jargon out of the Albanian public journey', () => {
    const publicCopy = collectCopyValues(sq.freeStart).join(' ');

    expect(publicCopy).not.toMatch(/intake/i);
  });
});
