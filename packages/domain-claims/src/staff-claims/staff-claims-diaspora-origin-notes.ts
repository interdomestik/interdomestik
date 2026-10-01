import { eq, or } from '@interdomestik/database';
import type { claimStageHistory } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';

const DIASPORA_ORIGIN_NOTE_PREFIXES = [
  'Started from Diaspora / Green Card quickstart. Country:',
  'Member-submitted Diaspora/Green Card guidance:',
] as const;

const DIASPORA_ORIGIN_NOTE_SUFFIXES = [
  '. Incident location: abroad.',
  '; not incident-country authority.',
] as const;

const DIASPORA_ORIGIN_NOTE_COUNTRIES = ['DE', 'CH', 'AT', 'IT'] as const;

// buildDiasporaOriginNoteCondition (diaspora-origin-filter.ts) only enumerates the
// 8 canonical prefix/suffix pairs. The parser regex accepts all 16 cross-combinations
// (2 prefixes x 4 countries x 2 suffixes), so reusing those 8 strings here would
// silently drop valid notes written with the other prefix/suffix pairing.
export const VALID_DIASPORA_ORIGIN_NOTES: readonly string[] = DIASPORA_ORIGIN_NOTE_PREFIXES.flatMap(
  prefix =>
    DIASPORA_ORIGIN_NOTE_COUNTRIES.flatMap(country =>
      DIASPORA_ORIGIN_NOTE_SUFFIXES.map(suffix => `${prefix} ${country}${suffix}`)
    )
);

export function buildValidDiasporaOriginNoteCondition(
  noteColumn: typeof claimStageHistory.note
): SQL<unknown> {
  return or(...VALID_DIASPORA_ORIGIN_NOTES.map(note => eq(noteColumn, note)))!;
}
