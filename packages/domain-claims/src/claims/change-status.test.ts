import { mocks, statusTransaction } from './change-status.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { changeClaimStatus } from './change-status';
import { claimFixture } from './lifecycle-test-support';

const owner = { id: 'member-1', emailVerified: true, role: 'branch_manager' };
const member = { userId: 'member-1', role: 'member' };
const admin = { userId: 'admin-1', role: 'tenant_admin' };
const staff = { userId: 'staff-1', role: 'staff' };
const submitted = claimFixture('submitted', {
  title: 'Test claim',
  staffId: null,
  lifecycleVersion: 6,
});
const meta = { hostId: null };
const input = { claimId: 'claim-1', toStatus: 'verification' };

function run(actor = admin, overrides = {}) {
  return changeClaimStatus(
    mintTestTenantAuthority('tenant-1', actor),
    { ...input, ...overrides },
    meta
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('changeClaimStatus', () => {
  it.each([
    member,
    { userId: 'agent-1', role: 'agent' },
    { userId: 'manager-1', role: 'branch_manager' },
  ])('denies the $role role before opening a transaction', async actor => {
    expect(await run(actor)).toEqual({ ok: false, code: 'forbidden_role' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('denies admission without a principal and refuses identity injection', async () => {
    expect(await changeClaimStatus(mintTestTenantAuthority('tenant-1'), input, meta)).toEqual({
      ok: false,
      code: 'forbidden_role',
    });
    expect(await run(staff, { tenantId: 'tenant-2', actorId: 'admin-1' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([{ isPublicNote: false }, { allowanceOverrideReason: 'override' }])(
    'refuses an administrator-only denial before any claim read',
    async overrides => {
      expect(await run(admin, overrides)).toEqual({ ok: false, code: 'forbidden_role' });
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );

  it('uses staff assignment scope and hides claims outside it', async () => {
    const result = statusTransaction({});
    expect(await run(staff)).toEqual({ ok: false, code: 'not_found' });
    expect(result.operations).toEqual(['read:claim:no key update', 'rollback']);
    expect(result.conditions['read:claim']).toEqual(
      expect.objectContaining({
        sql: expect.stringContaining('"claim"."staffId"'),
        params: expect.arrayContaining(['tenant-1', 'claim-1', 'staff-1']),
      })
    );
    expect(result.writes).toEqual({});
  });

  it.each([
    [claimFixture('draft', { lifecycleVersion: 6 }), 'submitted', 'draft_not_changeable'],
    [{ caseLifecycleState: 'invalid' }, 'verification', 'invalid_current_status'],
    [submitted, 'resolved', 'illegal_transition'],
    [submitted, 'rejected', 'decline_reason_required'],
  ])('rolls back a refused status command with %s', async (row, toStatus, code) => {
    const result = statusTransaction({ 'read:claim:no key update': [row] });
    expect(await run(admin, { toStatus })).toEqual({ ok: false, code });
    expect(result.operations.at(-1)).toBe('rollback');
    expect(result.writes).toEqual({});
  });

  it.each([admin, staff])('writes history, audit, delivery and answer for $role', async actor => {
    const result = statusTransaction({
      'read:claim:no key update': [submitted],
      'read:user:share': [owner],
    });
    const outcome = await run(
      actor,
      actor === staff ? { isPublicNote: false, note: 'Private note' } : {}
    );
    expect(outcome).toEqual({
      ok: true,
      fromStatus: 'submitted',
      toStatus: 'verification',
      changed: true,
      deliveryIds: [expect.any(String)],
    });
    expect(result.writes.claim_stage_history).toEqual([
      expect.objectContaining({
        changedById: actor.userId,
        fromStatus: 'submitted',
        toStatus: 'verification',
      }),
    ]);
    expect(result.writes.domain_events).toContainEqual(
      expect.objectContaining({
        actorId: actor.userId,
        eventName: 'claim.status_changed',
        aggregateVersion: 7,
      })
    );
    expect(result.writes.audit_log).toContainEqual(
      expect.objectContaining({ actorId: actor.userId, action: 'claim.status_changed' })
    );
    expect(result.writes.notifications).toEqual([
      expect.objectContaining({ userId: owner.id, type: 'claim_status_changed' }),
    ]);
    expect(result.writes.notification_deliveries).toEqual([
      expect.objectContaining({
        recipientUserId: owner.id,
        idempotencyKey: 'claim-status:claim-1:7:email',
        facts: { fromStatus: 'submitted', toStatus: 'verification' },
      }),
    ]);
    expect(result.conditions['update:claim_response_requests'].params).toContain('claim_submitted');
    expect(result.writes.claim_response_requests).toEqual([
      expect.objectContaining({ answeredBy: actor.userId }),
    ]);
    const assignment = result.writes.audit_log?.find(audit => audit.action === 'claim.assigned');
    if (actor === staff) {
      expect(assignment).toMatchObject({
        metadata: { newStaffId: actor.userId, reason: 'status_change' },
      });
    } else {
      expect(assignment).toBeUndefined();
    }
    expect(result.operations.at(-1)).toBe('commit');
  });

  it('writes a scrubbed same-status note with no version bump, delivery, response answer or event', async () => {
    const result = statusTransaction({
      'read:claim:no key update': [
        claimFixture('rejected', { staffId: 'staff-1', lifecycleVersion: 6 }),
      ],
      'read:claim_escalation_agreements:share': [
        { decisionType: 'declined', declineReasonCode: 'conflict_or_integrity_concern' },
      ],
    });
    expect(await run(staff, { toStatus: 'rejected', note: 'Private integrity details' })).toEqual({
      ok: true,
      changed: false,
      fromStatus: 'rejected',
      toStatus: 'rejected',
      deliveryIds: [],
    });
    expect(result.operations).toEqual([
      'read:claim:no key update',
      'read:claim_escalation_agreements:share',
      'insert:claim_stage_history',
      'update:claim',
      'insert:audit_log',
      'commit',
    ]);
    expect(result.writes.claim).toEqual([{ updatedAt: expect.any(Date) }]);
    expect(result.writes.claim_stage_history?.[0]?.note).toBe(
      'We cannot accept this matter for staff-led recovery.'
    );
    expect(result.writes.audit_log?.[0]?.action).toBe('claim.status_note_added');
  });

  it('does not write for a same-status request without a note', async () => {
    const result = statusTransaction({ 'read:claim:no key update': [submitted] });
    expect(await run(admin, { toStatus: 'submitted' })).toMatchObject({ ok: true, changed: false });
    expect(result.operations).toEqual(['read:claim:no key update', 'commit']);
    expect(result.writes).toEqual({});
  });

  it.each([admin, staff])(
    'records a decline and protects note visibility for $role',
    async actor => {
      const result = statusTransaction({ 'read:claim:no key update': [submitted] });
      expect(
        await run(actor, {
          toStatus: 'rejected',
          declineReasonCode: 'conflict_or_integrity_concern',
          isPublicNote: actor !== staff,
          note: actor === staff ? 'Private integrity assessment' : undefined,
        })
      ).toMatchObject({ ok: true, changed: true });
      expect(result.writes.claim_escalation_agreements).toEqual([
        expect.objectContaining({
          decisionType: 'declined',
          declineReasonCode: 'conflict_or_integrity_concern',
          acceptedById: actor.userId,
        }),
      ]);
      expect(result.writes.claim_stage_history?.[0]?.note).toBe(
        actor === staff
          ? 'Private integrity assessment'
          : 'We cannot accept this matter for staff-led recovery.'
      );
      expect(result.operations.indexOf('insert:claim_escalation_agreements')).toBeLessThan(
        result.operations.indexOf('update:claim')
      );
    }
  );

  it('rolls the status and audit back if notification enqueue fails', async () => {
    const result = statusTransaction({
      'read:claim:no key update': [submitted],
      'read:user:share': [owner],
    });
    result.failInsert('notification_deliveries');
    expect(await run()).toEqual({ ok: false, code: 'transaction_failed' });
    expect(result.writes).toEqual({});
    expect(result.operations).toContain('update:claim');
    expect(result.operations.at(-1)).toBe('rollback');
  });

  it('maps a zero-row lifecycle CAS to a conflict and writes no subsequent effects', async () => {
    const result = statusTransaction({ 'read:claim:no key update': [submitted] });
    result.loseCas();
    expect(await run()).toEqual({ ok: false, code: 'conflict' });
    expect(result.conditions['update:claim'].sql).toContain('"claim"."lifecycle_version"');
    expect(result.operations.at(-1)).toBe('rollback');
    expect(result.writes).toEqual({});
  });
});
