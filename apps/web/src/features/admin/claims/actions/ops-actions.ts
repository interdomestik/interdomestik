'use server';

import {
  and,
  auditLog,
  claimMessages,
  claims,
  db,
  desc,
  eq,
  withTenantContext,
} from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { nanoid } from 'nanoid';
import {
  assertCanMutateClaim,
  assertRowsAffected,
  canAssignClaimOwner,
  getActionSession,
  getClaimForMutation,
  logAudit,
  OpsActionResponse,
  revalidateClaim,
} from './action-helpers';
import { ASSIGNMENT_TARGET_DENIED_ERROR, assignClaimOwnerInTransaction } from './ops-assignment';
import { updateStatusAction } from './ops-status-action';

const ASSIGNMENT_FAILED_ERROR = 'Assignment failed. Please try again.';
const EXPECTED_ASSIGN_DENIALS: ReadonlySet<string> = new Set([
  'Claim not found or access denied',
  'Cannot perform assign on a terminal claim.',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Assignment Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function assignOwner(
  claimId: string,
  staffId: string,
  locale: string
): Promise<OpsActionResponse> {
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };

    const actorId = ctx.session.user.id;
    const actorRole = ctx.session.user.role;
    if (!canAssignClaimOwner(actorRole)) return { success: false, error: 'Unauthorized' };

    const targetStaffId = typeof staffId === 'string' ? staffId.trim() : '';
    if (!targetStaffId || targetStaffId === actorId) {
      return { success: false, error: ASSIGNMENT_TARGET_DENIED_ERROR };
    }

    const result = await withTenantContext({ tenantId: ctx.tenantId, role: actorRole }, tx =>
      assignClaimOwnerInTransaction(tx, {
        actorId,
        actorRole,
        claimId,
        staffId: targetStaffId,
        tenantId: ctx.tenantId,
      })
    );

    if (result.success) {
      // CRITICAL: Invalidate BOTH detail layout and global claims list to update KPIs immediately
      revalidateClaim(locale, claimId);
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : undefined;
    if (message !== undefined && EXPECTED_ASSIGN_DENIALS.has(message)) {
      return { success: false, error: message };
    }
    // Never log or return the raw error: Drizzle messages embed SQL and bound params.
    console.error('Action Failed: assignOwner', error instanceof Error ? error.name : typeof error);
    return { success: false, error: ASSIGNMENT_FAILED_ERROR };
  }
}

export async function unassignOwner(claimId: string, locale: string): Promise<OpsActionResponse> {
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };
    if (!canAssignClaimOwner(ctx.session.user.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const claim = await getClaimForMutation(claimId, ctx.tenantId);
    assertCanMutateClaim(claim, ctx.session.user.role, 'assign');

    const updated = await db
      .update(claims)
      .set({
        staffId: null,
        assignedAt: null,
        assignedById: null,
        updatedAt: new Date(),
      })
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, ctx.tenantId)))
      .returning({
        id: claims.id,
        staffId: claims.staffId,
        assignedAt: claims.assignedAt, // Should be null
      });

    assertRowsAffected(updated);

    await logAudit(ctx.tenantId, ctx.session.user.id, 'unassign_owner', claimId, {
      previousStaffId: claim.staffId,
      claimNumber: claim.claimNumber,
    });

    // CRITICAL: Invalidate BOTH detail layout and global claims list to update KPIs immediately
    revalidateClaim(locale, claimId);

    return { success: true, data: updated[0] };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Actions
// ─────────────────────────────────────────────────────────────────────────────

export async function updateStatus(
  claimId: string,
  newStatus: ClaimStatus,
  locale: string
): Promise<OpsActionResponse> {
  return updateStatusAction(claimId, newStatus, locale);
}

export async function markSlaAcknowledged(
  claimId: string,
  locale: string
): Promise<OpsActionResponse> {
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };

    const claim = await getClaimForMutation(claimId, ctx.tenantId);
    assertCanMutateClaim(claim, ctx.session.user.role, 'sla_ack');

    // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
    await db.insert(claimMessages).values({
      id: nanoid(),
      tenantId: ctx.tenantId,
      claimId,
      senderId: ctx.session.user.id,
      content: '⚡ SLA Breach Acknowledged',
      isInternal: true,
      createdAt: new Date(),
    });

    await logAudit(ctx.tenantId, ctx.session.user.id, 'acknowledge_sla', claimId, {});
    revalidateClaim(locale, claimId);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}

export async function sendMemberReminder(
  claimId: string,
  channel: 'email' | 'sms' = 'email',
  locale: string
): Promise<OpsActionResponse> {
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };

    const claim = await getClaimForMutation(claimId, ctx.tenantId);
    assertCanMutateClaim(claim, ctx.session.user.role, 'poke');

    // Rate limit check
    const lastPoke = await db.query.auditLog.findFirst({
      where: and(
        eq(auditLog.entityId, claimId),
        eq(auditLog.action, 'send_reminder'),
        eq(auditLog.tenantId, ctx.tenantId)
      ),
      orderBy: [desc(auditLog.createdAt)],
    });

    if (lastPoke?.createdAt) {
      const minutes = Math.floor((Date.now() - lastPoke.createdAt.getTime()) / 60_000);
      if (minutes < 10) {
        return {
          success: false,
          error: `Rate limited. Last reminder sent ${minutes} minutes ago.`,
        };
      }
    }

    await logAudit(ctx.tenantId, ctx.session.user.id, 'send_reminder', claimId, { channel });
    // db-access-guard: tenant-scoped -- reason: tenant predicate built by local helper and consumed by this DB call
    await db.insert(claimMessages).values({
      id: nanoid(),
      tenantId: ctx.tenantId,
      claimId,
      senderId: ctx.session.user.id,
      content: `📤 Sent ${channel} reminder to member.`,
      isInternal: true,
      createdAt: new Date(),
    });

    revalidateClaim(locale, claimId);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}
