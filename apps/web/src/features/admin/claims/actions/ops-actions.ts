'use server';

import { and, auditLog, claimMessages, claims, db, desc, eq } from '@interdomestik/database';
import { ClaimStatus } from '@interdomestik/database/constants';
import { nanoid } from 'nanoid';
import {
  assertCanMutateClaim,
  assertRowsAffected,
  assertTransitionAllowed,
  getActionSession,
  getClaimForMutation,
  logAudit,
  OpsActionResponse,
  revalidateClaim,
} from './action-helpers';

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

    const claim = await getClaimForMutation(claimId, ctx.tenantId);
    assertCanMutateClaim(claim, ctx.session.user.role, 'assign');

    const updated = await db
      .update(claims)
      .set({
        staffId,
        assignedAt: new Date(),
        assignedById: ctx.session.user.id,
        updatedAt: new Date(),
      })
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, ctx.tenantId)))
      .returning({
        id: claims.id,
        staffId: claims.staffId,
        assignedAt: claims.assignedAt,
        assignedById: claims.assignedById,
      });

    assertRowsAffected(updated);

    await logAudit(ctx.tenantId, ctx.session.user.id, 'assign_owner', claimId, {
      previousStaffId: claim.staffId,
      newStaffId: staffId,
      claimNumber: claim.claimNumber,
    });

    // CRITICAL: Invalidate BOTH detail layout and global claims list to update KPIs immediately
    revalidateClaim(locale, claimId);

    return {
      success: true,
      // Return updated fields for optimistic UI updates if needed
      data: updated[0],
    };
  } catch (error: unknown) {
    console.error('Action Failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function unassignOwner(claimId: string, locale: string): Promise<OpsActionResponse> {
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };

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
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };

    const claim = await getClaimForMutation(claimId, ctx.tenantId);
    assertCanMutateClaim(claim, ctx.session.user.role, 'status_change');
    assertTransitionAllowed(claim.status as ClaimStatus, newStatus);

    if (
      claim.staffId &&
      claim.staffId !== ctx.session.user.id &&
      ctx.session.user.role !== 'admin'
    ) {
      throw new Error('Only the assigned owner can update the status.');
    }

    const updated = await db
      .update(claims)
      .set({ status: newStatus, updatedAt: new Date(), statusUpdatedAt: new Date() })
      .where(and(eq(claims.id, claimId), eq(claims.tenantId, ctx.tenantId)))
      .returning({ id: claims.id });

    assertRowsAffected(updated);
    await logAudit(ctx.tenantId, ctx.session.user.id, 'update_status', claimId, {
      previousStatus: claim.status,
      newStatus,
    });
    revalidateClaim(locale, claimId);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
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
      where: and(eq(auditLog.entityId, claimId), eq(auditLog.action, 'send_reminder')),
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
