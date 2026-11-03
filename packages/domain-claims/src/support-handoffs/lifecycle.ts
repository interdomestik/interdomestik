import { and, eq, sql, supportHandoffs, user as userTable } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type {
  CloseSupportHandoffResult,
  SupportHandoffActionResult,
  SupportHandoffDeps,
  SupportHandoffLifecycleInput,
  SupportHandoffSession,
} from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  authority: TenantAuthority;
  branchId: string | null;
  staffId: string;
}) {
  const { tenantId } = readTenantAuthority(args.authority);
  const base = and(eq(userTable.id, args.staffId), eq(userTable.role, 'staff'));
  const scoped = args.branchId ? and(base, eq(userTable.branchId, args.branchId)) : base;
  const row = await withTenantAuthority(args.authority, tx =>
    tx.query.user.findFirst({
      where: withTenant(tenantId, userTable.tenantId, scoped),
      columns: { id: true },
    })
  );

  return row != null;
}

export async function acceptSupportHandoffCore(
  params: SupportHandoffLifecycleInput & {
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<{ lifecycleVersion: number }>> {
  const staffSession = requireStaffSession(params.session);
  const authority = params.authority;
  if (!staffSession || !authority) {
    return { success: false, error: 'Unauthorized' };
  }
  const { tenantId } = readTenantAuthority(authority);

  const expectedVersion = params.expectedVersion ?? 0;
  const now = new Date();
  const branchScope = buildBranchScope(staffSession.user.branchId ?? null);
  const updated = await withTenantAuthority(authority, tx =>
    tx
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
          tenantId,
          supportHandoffs.tenantId,
          and(
            eq(supportHandoffs.id, params.handoffId),
            eq(supportHandoffs.status, 'open'),
            eq(supportHandoffs.lifecycleVersion, expectedVersion),
            branchScope
          )
        )
      )
      .returning({ lifecycleVersion: supportHandoffs.lifecycleVersion })
  );

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before it could be accepted' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      authority,
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
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<{ lifecycleVersion: number }>> {
  const staffSession = requireStaffSession(params.session);
  const authority = params.authority;
  if (!staffSession || !authority) {
    return { success: false, error: 'Unauthorized' };
  }
  const { tenantId } = readTenantAuthority(authority);

  const reason = normalizeReason(params.reason);
  if (!reason) {
    return { success: false, error: 'Reassignment reason is required' };
  }

  const branchId = staffSession.user.branchId ?? null;
  const canAssign = await assertScopedStaff({
    authority,
    branchId,
    staffId: params.nextStaffId,
  });
  if (!canAssign) {
    return { success: false, error: 'Staff member not found or out of scope' };
  }

  const now = new Date();
  const updated = await withTenantAuthority(authority, tx =>
    tx
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
          tenantId,
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
      .returning({ lifecycleVersion: supportHandoffs.lifecycleVersion })
  );

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before it could be reassigned' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      authority,
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
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<CloseSupportHandoffResult>> {
  const staffSession = requireStaffSession(params.session);
  const authority = params.authority;
  if (!staffSession || !authority) {
    return { success: false, error: 'Unauthorized' };
  }
  const { tenantId } = readTenantAuthority(authority);

  const reason = normalizeReason(params.reason);
  if (!reason) {
    return { success: false, error: 'Close reason is required' };
  }

  const now = new Date();
  const updated = await withTenantAuthority(authority, tx =>
    tx
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
          tenantId,
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
      })
  );

  const row = updated[0];
  if (!row) {
    return { success: false, error: 'Handoff changed before it could be closed' };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: staffSession.user.id,
      actorRole: staffSession.user.role,
      authority,
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
