import { describe, expect, it } from 'vitest';

import { parseDiasporaOriginFromPublicNote } from './diaspora-origin';

describe('parseDiasporaOriginFromPublicNote', () => {
  it('extracts diaspora provenance from the canonical Green Card submit note', () => {
    expect(
      parseDiasporaOriginFromPublicNote(
        'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.'
      )
    ).toEqual({
      country: 'IT',
      source: 'diaspora-green-card',
    });
  });

  it('returns null for unrelated public notes', () => {
    expect(
      parseDiasporaOriginFromPublicNote('Member provided a new invoice and passport scan.')
    ).toBeNull();
  });
});
