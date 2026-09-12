import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it } from 'vitest';
import {
  type MemberEventPresentationContext,
  type MemberEventPresentationRow,
  presentMemberDomainEvent,
} from './member-event-presentation-registry';

describe('presentMemberDomainEvent', () => {
  const defaultDate = new Date('2026-09-11T15:44:00.000Z');
  const fallbackStatus: ClaimStatus = 'submitted';
  const defaultContext: MemberEventPresentationContext = Object.freeze({
    currentStatus: fallbackStatus,
    piiStatus: 'available',
  });

  const baseRow: MemberEventPresentationRow = Object.freeze({
    createdAt: defaultDate,
    eventName: 'case.created',
    eventVersion: 1,
    id: 'evt-row-001',
    note: null,
    payload: Object.freeze({}),
  });

  const verifiedCaseEvents = ['case.created@1', 'case.lifecycle_changed@1'] as const;

  const verifiedRecoveryEvents = [
    'recovery.lifecycle_changed@1',
    'recovery.decision_recorded@1',
    'recovery.escalation_agreement_recorded@1',
    'recovery.success_fee_collected@1',
    'recovery.handed_off_to_jurisdiction@1',
  ] as const;

  const verifiedMembershipEvents = [
    'membership.agent_client_bound@1',
    'membership.agent_attribution_recorded@1',
    'membership.entity_migrated@1',
    'membership.subscription_changed@1',
  ] as const;

  it('validates claim.status_changed@1 transition, retains row identity, and preserves note', () => {
    const fromStatus: ClaimStatus = 'submitted';
    const toStatus: ClaimStatus = 'evaluation';
    const noteText = 'Claim transitioned after initial verification';

    const row: MemberEventPresentationRow = Object.freeze({
      createdAt: defaultDate,
      eventName: 'claim.status_changed',
      eventVersion: 1,
      id: 'claim-evt-123',
      note: noteText,
      payload: Object.freeze({ fromStatus, toStatus }),
    });

    const result = presentMemberDomainEvent(defaultContext, row);

    expect(result).toEqual({
      id: 'claim-evt-123',
      date: defaultDate,
      statusTo: toStatus,
      statusFrom: fromStatus,
      labelKey: `claims-tracking.status.${toStatus}`,
      note: noteText,
      isPublic: true,
    });
    expect(result.date).toBe(defaultDate);
  });

  it.each(verifiedCaseEvents)('maps verified case event %s to fixed case update', fullEventKey => {
    const [eventName, versionStr] = fullEventKey.split('@');
    const row: MemberEventPresentationRow = Object.freeze({
      ...baseRow,
      id: `case-evt-${eventName}`,
      eventName,
      eventVersion: Number(versionStr),
      note: 'should not be visible',
      payload: Object.freeze({ secretDetail: 'case_sensitive_val' }),
    });

    const result = presentMemberDomainEvent(defaultContext, row);

    expect(result).toEqual({
      id: row.id,
      date: defaultDate,
      statusTo: fallbackStatus,
      statusFrom: null,
      labelKey: 'claims-tracking.tracking.timeline.caseUpdate',
      note: null,
      isPublic: true,
    });
    expect(JSON.stringify(result)).not.toContain('case_sensitive_val');
  });

  it.each(verifiedRecoveryEvents)(
    'maps verified recovery event %s to fixed recovery update',
    fullEventKey => {
      const [eventName, versionStr] = fullEventKey.split('@');
      const row: MemberEventPresentationRow = Object.freeze({
        ...baseRow,
        id: `recovery-evt-${eventName}`,
        eventName,
        eventVersion: Number(versionStr),
        note: 'private recovery note',
        payload: Object.freeze({ recoveryAmount: 9999 }),
      });

      const result = presentMemberDomainEvent(defaultContext, row);

      expect(result).toEqual({
        id: row.id,
        date: defaultDate,
        statusTo: fallbackStatus,
        statusFrom: null,
        labelKey: 'claims-tracking.tracking.timeline.recoveryUpdate',
        note: null,
        isPublic: true,
      });
      expect(JSON.stringify(result)).not.toContain('recoveryAmount');
    }
  );

  it.each(verifiedMembershipEvents)(
    'maps verified membership event %s to fixed membership update',
    fullEventKey => {
      const [eventName, versionStr] = fullEventKey.split('@');
      const row: MemberEventPresentationRow = Object.freeze({
        ...baseRow,
        id: `membership-evt-${eventName}`,
        eventName,
        eventVersion: Number(versionStr),
        note: 'private membership note',
        payload: Object.freeze({ membershipId: 'mem-internal-id' }),
      });

      const result = presentMemberDomainEvent(defaultContext, row);

      expect(result).toEqual({
        id: row.id,
        date: defaultDate,
        statusTo: fallbackStatus,
        statusFrom: null,
        labelKey: 'claims-tracking.tracking.timeline.membershipUpdate',
        note: null,
        isPublic: true,
      });
      expect(JSON.stringify(result)).not.toContain('mem-internal-id');
    }
  );

  it('routes unknown names, invalid versions, and malformed rows to the generic fallback', () => {
    const rows: MemberEventPresentationRow[] = [
      { ...baseRow, eventName: 'claim.status_changed', eventVersion: 999 },
      {
        ...baseRow,
        eventName: 'unknown.custom_event',
        note: 'fallback-private-note',
        payload: { actorEmail: 'fallback-leak@interdomestik.test' },
      },
      {
        ...baseRow,
        eventName: 'claim.status_changed',
        payload: { fromStatus: 'not_a_status', toStatus: 'invalid_status' },
      },
      { ...baseRow, eventName: 'claim.status_changed', payload: null },
      { ...baseRow, eventName: 'claim.status_changed', payload: [] },
    ];

    for (const row of rows) {
      const result = presentMemberDomainEvent(defaultContext, row);
      expect(result.id).toBe(row.id);
      expect(result.date).toBe(defaultDate);
      expect(result.statusTo).toBe(fallbackStatus);
      expect(result.statusFrom).toBeNull();
      expect(result.labelKey).toBe('claims-tracking.tracking.timeline.generic');
      expect(result.note).toBeNull();
      expect(result.isPublic).toBe(true);
      expect(JSON.stringify(result)).not.toContain('fallback-private-note');
      expect(JSON.stringify(result)).not.toContain('fallback-leak@interdomestik.test');
    }
  });

  it('redacts erased data and does not mutate or leak hostile input', () => {
    const nestedPayload = {
      actor: { email: 'leak@interdomestik.test' },
      secretToken: 'SUPER_SECRET_TOKEN_9999',
    };
    const snapshot = structuredClone(nestedPayload);
    const row: MemberEventPresentationRow = {
      ...baseRow,
      eventName: 'claim.status_changed',
      note: 'Confidential personal statement',
      payload: nestedPayload,
    };
    const context: MemberEventPresentationContext = {
      currentStatus: fallbackStatus,
      piiStatus: 'erased_or_unavailable',
    };

    const result = presentMemberDomainEvent(context, row);

    expect(row.payload).toEqual(snapshot);
    expect(row.createdAt).toBe(defaultDate);
    expect(context).toEqual({
      currentStatus: fallbackStatus,
      piiStatus: 'erased_or_unavailable',
    });
    expect(result.date).toBe(defaultDate);
    expect(JSON.stringify(result)).not.toContain('leak@interdomestik.test');
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET_TOKEN_9999');
    expect(result.note).toBeNull();
    expect(result.statusFrom).toBeNull();
    expect(result.statusTo).toBe(fallbackStatus);
    expect(result.labelKey).toBe('claims-tracking.tracking.timeline.redacted');
    expect(Object.keys(result).sort()).toEqual([
      'date',
      'id',
      'isPublic',
      'labelKey',
      'note',
      'statusFrom',
      'statusTo',
    ]);
  });
});
