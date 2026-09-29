import { describe, expect, it } from 'vitest';
import { getRecoveryDeclineMemberDescription } from '@interdomestik/domain-claims';
import type { ClaimTimelineEvent } from '../types';
import { sanitizeMemberRecoveryTimeline } from './member-recovery-timeline';

const safeNote = getRecoveryDeclineMemberDescription('conflict_or_integrity_concern');

function event(id: string, statusTo: string, note: string | null): ClaimTimelineEvent {
  return {
    id,
    date: new Date('2026-04-01T00:00:00.000Z'),
    statusFrom: 'evaluation',
    statusTo,
    labelKey: `claims-tracking.status.${statusTo}`,
    note,
    isPublic: true,
  };
}

describe('member recovery timeline', () => {
  it('masks every historic rejection note for a sensitive decline without mutating the input', () => {
    const timeline = [
      event('new-rejection', 'rejected', 'private allegation A'),
      event('follow-up', 'evaluation', 'Please upload a receipt.'),
      event('old-rejection', 'rejected', 'private allegation B'),
      event('no-note', 'rejected', null),
    ];
    const result = sanitizeMemberRecoveryTimeline(timeline, {
      acceptedAt: new Date('2026-03-31T00:00:00.000Z'),
      decisionType: 'declined',
      declineReasonCode: 'conflict_or_integrity_concern',
    });

    expect(result.map(item => item.note)).toEqual([
      safeNote,
      'Please upload a receipt.',
      safeNote,
      null,
    ]);
    expect(timeline[0]?.note).toBe('private allegation A');
  });

  it.each([
    'guidance_only_scope',
    'insufficient_evidence',
    'no_monetary_recovery_path',
    'counterparty_unidentified',
    'time_limit_risk',
  ])('preserves an ordinary %s decline note', declineReasonCode => {
    const timeline = [event('rejection', 'rejected', 'Staff explanation')];
    expect(
      sanitizeMemberRecoveryTimeline(timeline, {
        acceptedAt: new Date('2026-03-31T00:00:00.000Z'),
        decisionType: 'declined',
        declineReasonCode,
      })
    ).toEqual(timeline);
  });

  it('masks old rejection notes when a later decision is ordinary', () => {
    const timeline = [event('old', 'rejected', 'old sensitive allegation')];
    expect(
      sanitizeMemberRecoveryTimeline(timeline, {
        acceptedAt: new Date('2026-04-02T00:00:00.000Z'),
        decisionType: 'declined',
        declineReasonCode: 'insufficient_evidence',
      })[0]?.note
    ).toBe(safeNote);
  });

  it('masks a timestamp tie rather than treating it as proof of an ordinary note', () => {
    const timestamp = new Date('2026-04-01T00:00:00.000Z');
    expect(
      sanitizeMemberRecoveryTimeline([event('tie', 'rejected', 'old allegation')], {
        acceptedAt: timestamp,
        decisionType: 'declined',
        declineReasonCode: 'insufficient_evidence',
      })[0]?.note
    ).toBe(safeNote);
  });

  it.each([
    null,
    { acceptedAt: null, decisionType: 'declined', declineReasonCode: null },
    { acceptedAt: null, decisionType: 'declined', declineReasonCode: 'future_reason' },
    { acceptedAt: null, decisionType: 'accepted', declineReasonCode: 'insufficient_evidence' },
  ])('masks unproven ordinary declines', decision => {
    expect(
      sanitizeMemberRecoveryTimeline([event('old', 'rejected', 'staff allegation')], decision)[0]
        ?.note
    ).toBe(safeNote);
  });
});
