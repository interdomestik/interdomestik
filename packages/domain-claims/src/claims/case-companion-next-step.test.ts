import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';
import { deriveCaseCompanionNextStep } from './case-companion-next-step';

describe('deriveCaseCompanionNextStep', () => {
  it('returns exactly one typed next step for every accepted claim status', () => {
    const latestUpdateAt = new Date('2026-07-09T08:00:00.000Z');

    for (const status of CLAIM_STATUSES) {
      const nextStep = deriveCaseCompanionNextStep({ status, latestUpdateAt });

      expect(['member', 'interdomestik', 'insurer', 'court']).toContain(nextStep.owner);
      expect(nextStep.statusSentenceKey).toMatch(
        /^claims-tracking\.case_companion\.status_sentence\.[a-z_]+$/
      );
      expect(['action', 'no_action']).toContain(nextStep.actionKind);
      expect(nextStep.actionKey).toMatch(/^claims-tracking\.case_companion\.action\.[a-z_]+$/);
      expect(nextStep.renderMode).toBe('standard');
      expect(nextStep.statusSentenceKey).not.toBe(`claims-tracking.status.${status}`);

      const hasDate = nextStep.nextStepDate instanceof Date;
      const hasAwaitingReason = nextStep.awaitingDateReason !== null;
      expect(Number(hasDate) + Number(hasAwaitingReason)).toBe(1);
    }
  });

  it('uses a member-safe erased skeleton without personal or named-handler output', () => {
    const nextStep = deriveCaseCompanionNextStep({
      status: 'evaluation',
      latestUpdateAt: new Date('2026-07-09T08:00:00.000Z'),
      piiStatus: 'erased_or_unavailable',
    });

    expect(nextStep).toEqual({
      owner: 'interdomestik',
      statusSentenceKey: 'claims-tracking.case_companion.status_sentence.redacted',
      actionKind: 'no_action',
      actionKey: 'claims-tracking.case_companion.action.no_action',
      nextStepDate: null,
      awaitingDateReason: 'erased_subject',
      renderMode: 'erased',
    });
  });

  it('uses awaiting-date language instead of a synthesized date when no read-side date exists', () => {
    const nextStep = deriveCaseCompanionNextStep({ status: 'resolved' });

    expect(nextStep.nextStepDate).toBeNull();
    expect(nextStep.awaitingDateReason).toBe('outcome_recorded');
  });
});
