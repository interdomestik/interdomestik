import { describe, expect, it } from 'vitest';

import { parseDiasporaOriginFromPublicNote } from './diaspora-origin';

describe('diaspora note parser', () => {
  it.each([
    [
      'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.',
      'IT',
    ],
    ['Member-submitted Diaspora/Green Card guidance: CH; not incident-country authority.', 'CH'],
  ])('parses %s', (note, country) => {
    expect(parseDiasporaOriginFromPublicNote(note)).toEqual({
      country,
      source: 'diaspora-green-card',
    });
  });

  it('rejects unrelated notes', () => {
    expect(parseDiasporaOriginFromPublicNote('Unrelated public note.')).toBeNull();
  });
});
