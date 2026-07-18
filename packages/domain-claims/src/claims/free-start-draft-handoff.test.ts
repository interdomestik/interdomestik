import { describe, expect, it } from 'vitest';

import { buildFreeStartDraftClaimCopy, isEligibleFreeStartDraft } from './free-start-draft-handoff';

const completeDraft = {
  category: 'vehicle',
  counterparty: 'Example Insurer',
  desiredOutcome: 'written_response',
  incidentDate: '2026-07-17',
  issueType: 'collision',
  resumeStep: 'preview',
  summary: 'Rear bumper damage after a supported collision.',
} as const;

describe('free-start draft claim handoff domain C01-C06', () => {
  it('accepts only a complete vehicle or property preview', () => {
    expect(isEligibleFreeStartDraft(completeDraft)).toBe(true);
    expect(isEligibleFreeStartDraft({ ...completeDraft, category: 'property' })).toBe(true);
    expect(isEligibleFreeStartDraft({ ...completeDraft, summary: '' })).toBe(false);
    expect(isEligibleFreeStartDraft({ ...completeDraft, resumeStep: 'details' })).toBe(false);
  });

  it.each(['en', 'sq', 'sr', 'mk'] as const)(
    'maps all six saved facts deterministically for %s without editable input',
    locale => {
      const copy = buildFreeStartDraftClaimCopy(completeDraft, locale);
      expect(copy.title.length).toBeGreaterThanOrEqual(5);
      expect(copy.description).toContain('vehicle');
      for (const fact of [
        completeDraft.issueType,
        completeDraft.incidentDate,
        completeDraft.counterparty,
        completeDraft.desiredOutcome,
        completeDraft.summary,
      ]) {
        expect(copy.description).toContain(fact);
      }
    }
  );
});
