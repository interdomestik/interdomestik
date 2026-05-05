import { and, db, eq, sql, supportHandoffs, user as userTable } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type {
  CloseSupportHandoffResult,
  SupportHandoffActionResult,
  SupportHandoffDeps,
  SupportHandoffLifecycleInput,
  SupportHandoffSession,
} from './types';

type StaffUser = SupportHandoffSession['user'] & { branchId?: string | null };

function normalizeReason(value: string | null | undefined) {
  return value?.trim().slice(0, 500) ?? '';
}

function requireStaffSession(session: SupportHandoffSession | null) {
  if (session?.user?.role !== 'staff') {
    return null;
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return null;
  }

  const user = session.user as StaffUser;
  if (!user.branchId) {
    return null;
  }

  return { tenantId, user };
}

function buildBranchScope(branchId: string | null | undefined) {
  return branchId ? eq(supportHandoffs.branchId, branchId) : undefined;
}

async function assertScopedStaff(args: {
  branchId: string | null;
  staffId: string;
  tenantId: string;
}) {
  const base = and(eq(userTable.id, args.staffId), eq(userTable.role, 'staff'));
  const scoped = args.branchId ? and(base, eq(userTable.branchId, args.branchId)) : base;
  const row = await db.query.user.findFirst({
    where: withTenant(args.tenantId, userTable.tenantId, scoped),
    columns: { id: true },
  });

  return row != null;
}

export async function acceptSupportHandoffCore(
  params: SupportHandoffLifecycleInput & {
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<{ lifecycleVersion: number }>> {
  const staffSession = requireStaffSession(params.session);
  if (!staffSession) {
    return { success: false, error: 'Unauthorized' };
  }

  const expectedVersion = params.expectedVersion ?? 0;
  const now = new Date();
  const branchScope = buildBranchScope(staffSession.user.branchId ?? null);
  const updated = await db
    .update(supportHandoffs)
    .set({
      status: 'accepted',
      staffId: staffSession.user.id,
      acceptedAt: now,
      acceptedById: staffSession.user.id,
      updatedAt: now,
      lifecycleVersion: sql`${supportHandoffs.lifecycleVersion} + 1`,
    })
    .where(
      withTenant(
        staffSession.tenantId,
        supportHandoffs.tenantId,
        and(
          eq(supportHandoffs.id, params.handoffId),
          eq(supportHandoffs.status, 'open'),
          eq(supportHandoffs.lifecycleVersion, expectedVersion),
          branchScope
        )
      )
    )
    .returning({ lifecycleVersion: supportHandoffs.lifecycleVersion });

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before it could be accepted' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      tenantId: staffSession.tenantId,
      action: 'support_handoff.accepted',
      entityType: 'support_handoff',
      entityId: params.handoffId,
      metadata: { expectedVersion },
      headers: params.requestHeaders,
    });
  }

  return { success: true, data: { lifecycleVersion: row.lifecycleVersion } };
}

export async function reassignSupportHandoffCore(
  params: SupportHandoffLifecycleInput & {
    nextStaffId: string;
    reason: string;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<{ lifecycleVersion: number }>> {
  const staffSession = requireStaffSession(params.session);
  if (!staffSession) {
    return { success: false, error: 'Unauthorized' };
  }

  const reason = normalizeReason(params.reason);
  if (!reason) {
    return { success: false, error: 'Reassignment reason is required' };
  }

  const branchId = staffSession.user.branchId ?? null;
  const canAssign = await assertScopedStaff({
    branchId,
    staffId: params.nextStaffId,
    tenantId: staffSession.tenantId,
  });
  if (!canAssign) {
    return { success: false, error: 'Staff member not found or out of scope' };
  }

  const now = new Date();
  const updated = await db
    .update(supportHandoffs)
    .set({
      staffId: params.nextStaffId,
      reassignedAt: now,
      reassignedById: staffSession.user.id,
      reassignReason: reason,
      updatedAt: now,
      lifecycleVersion: sql`${supportHandoffs.lifecycleVersion} + 1`,
    })
    .where(
      withTenant(
        staffSession.tenantId,
        supportHandoffs.tenantId,
        and(
          eq(supportHandoffs.id, params.handoffId),
          eq(supportHandoffs.status, 'accepted'),
          eq(supportHandoffs.lifecycleVersion, params.expectedVersion ?? 0),
          eq(supportHandoffs.staffId, staffSession.user.id),
          buildBranchScope(branchId)
        )
      )
    )
    .returning({ lifecycleVersion: supportHandoffs.lifecycleVersion });

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before it could be reassigned' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      tenantId: staffSession.tenantId,
      action: 'support_handoff.reassigned',
      entityType: 'support_handoff',
      entityId: params.handoffId,
      metadata: {
        nextStaffId: params.nextStaffId,
        reason,
      },
      headers: params.requestHeaders,
    });
  }

  return { success: true, data: { lifecycleVersion: row.lifecycleVersion } };
}

export async function closeSupportHandoffCore(
  params: SupportHandoffLifecycleInput & {
    reason: string;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<CloseSupportHandoffResult>> {
  const staffSession = requireStaffSession(params.session);
  if (!staffSession) {
    return { success: false, error: 'Unauthorized' };
  }

  const reason = normalizeReason(params.reason);
  if (!reason) {
    return { success: false, error: 'Close reason is required' };
  }

  const now = new Date();
  const updated = await db
    .update(supportHandoffs)
    .set({
      status: 'closed',
      closedAt: now,
      closedById: staffSession.user.id,
      closeReason: reason,
      updatedAt: now,
      lifecycleVersion: sql`${supportHandoffs.lifecycleVersion} + 1`,
    })
    .where(
      withTenant(
        staffSession.tenantId,
        supportHandoffs.tenantId,
        and(
          eq(supportHandoffs.id, params.handoffId),
          eq(supportHandoffs.status, 'accepted'),
          eq(supportHandoffs.lifecycleVersion, params.expectedVersion ?? 0),
          eq(supportHandoffs.staffId, staffSession.user.id),
          buildBranchScope(staffSession.user.branchId ?? null)
        )
      )
    )
    .returning({
      handoffId: supportHandoffs.id,
      lifecycleVersion: supportHandoffs.lifecycleVersion,
      memberId: supportHandoffs.memberId,
      tenantId: supportHandoffs.tenantId,
    });

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before it could be closed' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      tenantId: staffSession.tenantId,
      action: 'support_handoff.closed',
      entityType: 'support_handoff',
      entityId: params.handoffId,
      metadata: { reason },
      headers: params.requestHeaders,
    });
  }

  return {
    success: true,
    data: {
      handoffId: row.handoffId,
      lifecycleVersion: row.lifecycleVersion,
      memberId: row.memberId,
      tenantId: row.tenantId,
    },
  };
}
