import { describe, expect, it } from 'vitest';
import { parseDiasporaOriginFromPublicNote } from '../claims/diaspora-origin';
import { VALID_DIASPORA_ORIGIN_NOTES } from './staff-claims-diaspora-origin-notes';

describe('VALID_DIASPORA_ORIGIN_NOTES', () => {
  it('contains exactly the 16 unique prefix/country/suffix cross-combinations', () => {
    expect(VALID_DIASPORA_ORIGIN_NOTES).toHaveLength(16);
    expect(new Set(VALID_DIASPORA_ORIGIN_NOTES).size).toBe(16);
  });

  it('is accepted by the real parser for every generated note', () => {
    for (const note of VALID_DIASPORA_ORIGIN_NOTES) {
      expect(parseDiasporaOriginFromPublicNote(note)).not.toBeNull();
    }
  });

  it('includes the two canonical pairs already used by the claim queue diaspora filter', () => {
    expect(VALID_DIASPORA_ORIGIN_NOTES).toContain(
      'Started from Diaspora / Green Card quickstart. Country: DE. Incident location: abroad.'
    );
    expect(VALID_DIASPORA_ORIGIN_NOTES).toContain(
      'Member-submitted Diaspora/Green Card guidance: DE; not incident-country authority.'
    );
  });

  it('includes the cross-combination forms NOT enumerated by buildDiasporaOriginNoteCondition', () => {
    expect(VALID_DIASPORA_ORIGIN_NOTES).toContain(
      'Started from Diaspora / Green Card quickstart. Country: DE; not incident-country authority.'
    );
    expect(VALID_DIASPORA_ORIGIN_NOTES).toContain(
      'Member-submitted Diaspora/Green Card guidance: DE. Incident location: abroad.'
    );
  });

  it('rejects notes with an unsupported country, same as the parser', () => {
    expect(VALID_DIASPORA_ORIGIN_NOTES).not.toContain(
      'Started from Diaspora / Green Card quickstart. Country: FR. Incident location: abroad.'
    );
  });
  it('matches parser acceptance in both directions across country and malformed variants', () => {
    const prefixes = [
      'Started from Diaspora / Green Card quickstart. Country:',
      'Member-submitted Diaspora/Green Card guidance:',
    ];
    const suffixes = ['. Incident location: abroad.', '; not incident-country authority.'];
    for (const prefix of prefixes) {
      for (const country of ['DE', 'CH', 'AT', 'IT', 'FR', 'XX']) {
        for (const suffix of suffixes) {
          const note = `${prefix} ${country}${suffix}`;
          for (const variant of [
            note,
            ` ${note}`,
            `${note} `,
            `${note}\n`,
            `${note}\r\n`,
            note.slice(0, -1),
          ]) {
            expect(VALID_DIASPORA_ORIGIN_NOTES.includes(variant)).toBe(
              parseDiasporaOriginFromPublicNote(variant) !== null
            );
          }
        }
      }
    }
  });
});
