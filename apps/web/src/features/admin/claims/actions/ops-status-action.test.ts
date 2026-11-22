import { updateClaimStatus as updateStaffStatus } from '@/actions/staff-claims.core';
import {
  auditLog,
  claimEscalationAgreements,
  claimResponseRequests,
  claims,
  claimStageHistory,
  domainEvents,
  notifications,
  notificationDeliveries,
  pushSubscriptions,
  user,
  userNotificationPreferences,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateStatus } from './ops-actions';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  transaction: vi.fn(),
  refusal: vi.fn(),
  rateLimit: vi.fn(),
  refresh: vi.fn(),
  projection: vi.fn(),
  kick: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.refusal }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: mocks.rateLimit }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@interdomestik/domain-communications/notification-deliveries', async original => ({
  ...(await original<
    typeof import('@interdomestik/domain-communications/notification-deliveries')
  >()),
  dispatchNotificationDeliveries: mocks.kick,
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: mocks.transaction,
  relayClaimStatusAuditProjectionEvents: mocks.projection,
}));

const tenantId = 'tenant-claim-test';
const claimId = 'claim-1';

function signIn(role: string, options: { principal?: boolean; tenant?: string } = {}) {
  const authority = mintTestTenantAuthority(
    options.tenant ?? tenantId,
    options.principal === false ? {} : { userId: 'actor', role }
  );
  mocks.authorizeSessionTenant.mockResolvedValue({
    session: { user: { id: 'actor', role, branchId: 'branch-1' } },
    authority,
  });
  return authority;
}

type Row = Record<string, unknown>;
type Effect = { table: unknown; row: Row };
type FakeTransactionOptions = {
  current?: 'draft' | 'submitted' | 'verification' | 'rejected';
  inScope?: boolean;
  conflict?: boolean;
};

function configureTransaction(options: FakeTransactionOptions = {}) {
  const fromStatus = options.current ?? 'submitted';
  const lockedClaim = {
    id: claimId,
    ...claimLifecycleFieldsForStatus(fromStatus),
    category: 'consumer',
    lifecycleVersion: 4,
    staffId: 'actor',
    title: 'Test claim',
    userId: 'owner',
  };
  const rows = (table: unknown): Row[] => {
    if (table === claims) return options.inScope === false ? [] : [lockedClaim];
    if (table === user) return [{ id: 'owner', role: 'agent', emailVerified: true }];
    if (table === pushSubscriptions) return [{ id: 'push-1' }];
    if (table === userNotificationPreferences || table === claimEscalationAgreements) return [];
    throw new Error('Unexpected table read in claim status test');
  };
  const firstLock = vi.fn();
  const writes: Effect[] = [];
  const inserts: Effect[] = [];
  let committed = false;
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          const chain = {
            for: async (strength: string) => {
              firstLock(table, strength);
              return rows(table);
            },
          };
          return Object.assign(Promise.resolve(rows(table)), chain, {
            limit: () => Object.assign(Promise.resolve(rows(table)), chain),
          });
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (row: Row) => ({
        where: () => {
          writes.push({ table, row });
          return {
            returning: async () =>
              options.conflict
                ? []
                : [
                    {
                      id: claimId,
                      lifecycleVersion: 'lifecycleVersion' in row ? 5 : 4,
                    },
                  ],
          };
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: Row) => {
        inserts.push({ table, row });
        return {
          returning: async () => [{ id: row.id }],
          onConflictDoNothing: () => ({
            returning: async () => [{ id: row.id }],
          }),
        };
      },
    }),
  };
  mocks.transaction.mockImplementationOnce(async (_authority, run) => {
    const result = await run(tx);
    committed = true;
    return result;
  });
  return { inserts, writes, firstLock, committed: () => committed };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rateLimit.mockResolvedValue({ limited: false });
  mocks.refusal.mockResolvedValue({ success: true });
  mocks.transaction.mockImplementation(async (_authority, run) => run({ projection: true }));
});

describe('the staff and admin status entry points', () => {
  it.each(['staff', 'admin', 'tenant_admin', 'super_admin'])(
    'commits the same history, event, audit, delivery and response answer for %s',
    async role => {
      const authority = signIn(role);
      const tx = configureTransaction();
      mocks.kick.mockImplementation(async () => void expect(tx.committed()).toBe(true));

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

  it.each(['member', 'staff'])(
    'denies an admin status call from %s before claim I/O',
    async role => {
      signIn(role);
      await expect(updateStatus(claimId, 'verification', 'en')).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.kick).not.toHaveBeenCalled();
    }
  );

  it.each(['member', 'agent', 'branch_manager', 'admin', 'auditor'])(
    'denies a staff status call from %s before claim I/O',
    async role => {
      signIn(role);
      await expect(updateStaffStatus(claimId, 'verification')).resolves.toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
      expect(mocks.rateLimit).not.toHaveBeenCalled();
    }
  );

  it('refuses a staff authority without a principal before claim I/O', async () => {
    signIn('staff', { principal: false });
    await expect(updateStaffStatus(claimId, 'verification')).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('returns the same staff denial when the scoped claim lock returns no row', async () => {
    signIn('staff');
    const tx = configureTransaction({ inScope: false });
    await expect(updateStaffStatus(claimId, 'verification')).resolves.toMatchObject({
      success: false,
      code: 'NOT_FOUND',
    });
    expect(tx.firstLock).toHaveBeenCalledWith(claims, 'no key update');
    expect(tx.writes).toEqual([]);
    expect(tx.committed()).toBe(false);
  });

  it('uses the trusted access tenant when an admin session has a different home', async () => {
    const authority = signIn('admin', { tenant: 'tenant-access' });
    const tx = configureTransaction();
    await expect(updateStatus(claimId, 'verification', 'en')).resolves.toEqual({ success: true });
    expect(mocks.transaction.mock.calls[0][0]).toBe(authority);
    expect(tx.inserts.find(effect => effect.table === auditLog)?.row.tenantId).toBe(
      'tenant-access'
    );
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

  it.each([
    ['draft', 'submitted', 'draft_not_changeable'],
    ['submitted', 'rejected', 'decline_reason_required'],
  ] as const)('refuses admin %s to %s with %s', async (current, target, code) => {
    signIn('admin');
    const tx = configureTransaction({ current });
    await expect(updateStatus(claimId, target, 'en')).resolves.toMatchObject({
      success: false,
      code,
    });
    expect(tx.writes).toEqual([]);
    expect(tx.inserts).toEqual([]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
