import en from '@/messages/en/claims.json';
import mk from '@/messages/mk/claims.json';
import sq from '@/messages/sq/claims.json';
import sr from '@/messages/sr/claims.json';
import { getRecoveryDeclineMemberDescription } from '@interdomestik/domain-claims';
import { describe, expect, it } from 'vitest';
import { localizeMemberRecoveryPublicNote } from './member-recovery-public-note';

const safeNote = getRecoveryDeclineMemberDescription('conflict_or_integrity_concern');

describe('member recovery public note', () => {
  it.each([en, sq, mk, sr])('uses the current locale for a sensitive decline', catalog => {
    const translated = catalog.claims.detail.recoveryDecision.reasons.other.description;
    expect(translated).toBeTruthy();
    expect(translated).not.toBe(safeNote);
    expect(localizeMemberRecoveryPublicNote(safeNote, () => translated)).toBe(translated);
  });

  it('localizes the fixed sentence with surrounding whitespace', () => {
    expect(localizeMemberRecoveryPublicNote(`  ${safeNote}\n`, () => 'Safe translation')).toBe(
      'Safe translation'
    );
  });

  it('preserves an ordinary public status note', () => {
    expect(localizeMemberRecoveryPublicNote('Documents received.', () => 'translated')).toBe(
      'Documents received.'
    );
  });

  it('preserves a staff note that quotes the fixed sentence', () => {
    const note = `${safeNote} Please review the attached letter.`;
    expect(localizeMemberRecoveryPublicNote(note, () => 'Safe translation')).toBe(note);
  });

  it('passes empty fields through', () => {
    expect(localizeMemberRecoveryPublicNote(null, () => 'Safe translation')).toBeNull();
    expect(localizeMemberRecoveryPublicNote(undefined, () => 'Safe translation')).toBeUndefined();
  });
});
