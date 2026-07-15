import { describe, expect, it } from 'vitest';

import en from './en/freeStart.json';
import mk from './mk/freeStart.json';
import sq from './sq/freeStart.json';
import sr from './sr/freeStart.json';

const localeMessages = { en, mk, sq, sr } as const;

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
});
