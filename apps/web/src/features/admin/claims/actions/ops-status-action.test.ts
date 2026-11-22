import { claimId, configureTransaction, mocks, signIn } from './ops-status-action.test-support';
import { updateClaimStatus as updateStaffStatus } from '@/actions/staff-claims.core';
import {
  auditLog,
  claimResponseRequests,
  claims,
  claimStageHistory,
  domainEvents,
  notifications,
  notificationDeliveries,
} from '@interdomestik/database';
import { describe, expect, it, vi } from 'vitest';
import { updateStatus } from './ops-actions';

describe('the staff and admin status entry points', () => {
  it.each(['staff', 'admin', 'tenant_admin', 'super_admin'])(
    'commits the same history, event, audit, delivery and response answer for %s',
    async role => {
      const authority = signIn(role);
      const tx = configureTransaction();
      mocks.kick.mockImplementation(() => Promise.resolve(void expect(tx.committed()).toBe(true)));

      const result =
        role === 'staff'
          ? await updateStaffStatus(claimId, 'verification')
          : await updateStatus(claimId, 'verification', 'en');

      expect(result).toEqual({ success: true });
      expect(mocks.transaction.mock.calls[0][0]).toBe(authority);
      expect(tx.firstLock.mock.calls[0]).toEqual([claims, 'no key update']);
      const rows = (table: unknown) =>
        tx.inserts.filter(effect => effect.table === table).map(effect => effect.row);
      expect(rows(claimStageHistory)).toEqual([
        expect.objectContaining({
          fromStatus: 'submitted',
          toStatus: 'verification',
          changedById: 'actor',
          isPublic: true,
        }),
      ]);
      expect(rows(domainEvents).map(row => row.eventName)).toEqual([
        'claim.status_changed',
        'case.lifecycle_changed',
      ]);
      expect(rows(auditLog)).toEqual([
        expect.objectContaining({
          action: 'claim.status_changed',
          metadata: expect.objectContaining({
            previousStatus: 'submitted',
            newStatus: 'verification',
            lifecycleVersion: 5,
          }),
        }),
      ]);
      expect(rows(notifications)).toEqual([
        expect.objectContaining({
          type: 'claim_status_changed',
          userId: 'owner',
          actionUrl: '/member/claims/claim-1',
        }),
      ]);
      const deliveries = rows(notificationDeliveries);
      expect(deliveries).toEqual([
        expect.objectContaining({
          channel: 'email',
          recipientUserId: 'owner',
          idempotencyKey: 'claim-status:claim-1:5:email',
        }),
        expect.objectContaining({
          channel: 'push',
          recipientUserId: 'owner',
          idempotencyKey: 'claim-status:claim-1:5:push:push-1',
        }),
      ]);
      expect(tx.writes).toContainEqual({
        table: claimResponseRequests,
        row: expect.objectContaining({
          answeredBy: 'actor',
          answerKind: 'member_visible_status_change',
        }),
      });
      expect(mocks.projection).toHaveBeenCalledTimes(1);
      expect(mocks.kick).toHaveBeenCalledWith(authority, expect.any(Object), {
        ids: deliveries.map(row => row.id),
      });
      expect(mocks.refresh).toHaveBeenCalled();
    }
  );

  it.each(['staff', 'admin'])(
    'adds a same-status note without events, delivery, or a version bump for %s',
    async role => {
      signIn(role);
      const tx = configureTransaction();
      const note = 'Follow-up recorded';
      const result =
        role === 'staff'
          ? await updateStaffStatus(claimId, 'submitted', note)
          : await updateStatus(claimId, 'submitted', 'en', { note });
      expect(result).toEqual({ success: true });
      expect(tx.inserts).toEqual([
        {
          table: claimStageHistory,
          row: expect.objectContaining({ note, fromStatus: 'submitted', toStatus: 'submitted' }),
        },
        { table: auditLog, row: expect.objectContaining({ action: 'claim.status_note_added' }) },
      ]);
      expect(tx.writes).toEqual([{ table: claims, row: { updatedAt: expect.any(Date) } }]);
      expect(mocks.kick).not.toHaveBeenCalled();
    }
  );

  it.each(['staff', 'admin'])('writes and refreshes canonical values for %s', async role => {
    signIn(role);
    const tx = configureTransaction();
    const note = 'a'.repeat(2000);
    const paddedClaimId = `  ${claimId} `;
    const paddedNote = `  ${note} `;
    const result =
      role === 'staff'
        ? await updateStaffStatus(paddedClaimId, 'submitted', paddedNote)
        : await updateStatus(paddedClaimId, 'submitted', 'en', { note: paddedNote });

    expect(result).toEqual({ success: true });
    expect(tx.inserts).toContainEqual({
      table: claimStageHistory,
      row: expect.objectContaining({ claimId, note }),
    });
    const paths = mocks.refresh.mock.calls.map(([path]) => path);
    const scope = role === 'staff' ? 'staff' : 'admin';
    expect(paths).toContain(`/en/${scope}/claims/${claimId}`);
    expect(paths.every(path => !path.includes(paddedClaimId))).toBe(true);
  });

  it('refreshes the committed staff update after independent audit and kick failures', async () => {
    signIn('staff');
    const tx = configureTransaction();
    const projectionError = new Error('projection failed');
    const kickError = new Error('kick failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mocks.projection.mockRejectedValueOnce(projectionError);
      mocks.kick.mockRejectedValueOnce(kickError);
      await expect(updateStaffStatus(claimId, 'verification')).resolves.toEqual({ success: true });
      expect(tx.committed()).toBe(true);
      expect(log).toHaveBeenCalledWith(
        'Failed to project claim status audit event:',
        projectionError
      );
      expect(log).toHaveBeenCalledWith('Notification delivery kick failed after commit', kickError);
      expect(mocks.refresh).toHaveBeenCalledTimes(20);
    } finally {
      log.mockRestore();
    }
  });

  it('keeps the admin committed-refresh-pending outcome and logs the refresh error', async () => {
    signIn('admin');
    const tx = configureTransaction();
    const error = new Error('refresh failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mocks.refresh.mockImplementationOnce(() => {
        throw error;
      });
      await expect(updateStatus(claimId, 'verification', 'en')).resolves.toMatchObject({
        success: true,
        refreshPending: true,
      });
      expect(tx.committed()).toBe(true);
      expect(log).toHaveBeenCalledWith(
        'Revalidation failed after commit: updateStatus',
        expect.objectContaining({ message: 'revalidation_failure', cause: 'Error' })
      );
    } finally {
      log.mockRestore();
    }
  });
});
