import { sendMemberActivationInvite } from '@/lib/member-activation-invite';
import type { ProtectedActionContext } from '@/lib/safe-action';
import { account, auditLog, user } from '@interdomestik/database/schema';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema/leads';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { aliasedTable, and, eq, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { z } from 'zod';
import type { resendActivationInviteSchema } from '../schemas';
import {
  canResendActivationInvite,
  resolveVerificationReadScope,
  withSessionStaffBranch,
} from '../queries/read-access';

export const RESEND_ACTIVATION_INVITE_ACTION = 'MEMBER_ACTIVATION_INVITE_RESENT';
export const RESEND_ACTIVATION_INVITE_COOLDOWN_MS = 60_000;

export type ResendActivationInviteResult =
  | { success: true; invite: 'sent' }
  | { success: false; error: 'not_found' | 'already_active' | 'cooldown' | 'delivery_failed' };

type Admission = { ok: true; email: string; memberId: string } | ResendActivationInviteResult;

/**
 * Resends the activation invite of a member converted from an approved cash attempt who has not
 * yet proven their mailbox (a crash or delivery failure between commit and send). The recipient is
 * the committed member's own email, never caller input. Every resend is audited and rate-limited
 * per attempt; the audit row carries no email.
 */
export async function resendActivationInviteCore(
  ctx: ProtectedActionContext,
  input: z.infer<typeof resendActivationInviteSchema>
): Promise<ResendActivationInviteResult> {
  const { tenantId, session, authority } = ctx;
  if (!canResendActivationInvite(ctx.userRole)) return { success: false, error: 'not_found' };
  const scope = resolveVerificationReadScope(withSessionStaffBranch(ctx));
  if (scope.kind === 'none') return { success: false, error: 'not_found' };

  const member = aliasedTable(user, 'member');
  const credential = aliasedTable(account, 'member_credential');
  const admission: Admission = await withTenantAuthority(authority, async tx => {
    // Serializes concurrent resends of one attempt so the cooldown below cannot be raced.
    const [locked] = await tx
      .select({ id: leadPaymentAttempts.id })
      .from(leadPaymentAttempts)
      .where(
        and(eq(leadPaymentAttempts.id, input.attemptId), eq(leadPaymentAttempts.tenantId, tenantId))
      )
      .for('update');
    if (!locked) return { success: false, error: 'not_found' };

    const [row] = await tx
      .select({
        branchId: memberLeads.branchId,
        memberId: member.id,
        email: member.email,
        emailVerified: member.emailVerified,
        credentialId: credential.id,
      })
      .from(leadPaymentAttempts)
      .innerJoin(memberLeads, eq(memberLeads.id, leadPaymentAttempts.leadId))
      .innerJoin(
        member,
        and(eq(member.id, memberLeads.convertedUserId), eq(member.tenantId, tenantId))
      )
      .leftJoin(
        credential,
        and(eq(credential.userId, member.id), eq(credential.providerId, 'credential'))
      )
      .where(
        and(
          eq(leadPaymentAttempts.id, input.attemptId),
          eq(leadPaymentAttempts.status, 'succeeded'),
          eq(memberLeads.status, 'converted')
        )
      )
      .limit(1);
    if (!row || (scope.kind === 'branch' && row.branchId !== scope.branchId)) {
      return { success: false, error: 'not_found' };
    }
    // A password set from the invite completes activation: Better Auth leaves emailVerified false.
    if (row.emailVerified || row.credentialId) return { success: false, error: 'already_active' };

    const since = new Date(Date.now() - RESEND_ACTIVATION_INVITE_COOLDOWN_MS);
    const [recent] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.action, RESEND_ACTIVATION_INVITE_ACTION),
          eq(auditLog.entityType, 'payment_attempt'),
          eq(auditLog.entityId, input.attemptId),
          gt(auditLog.createdAt, since)
        )
      )
      .limit(1);
    if (recent) return { success: false, error: 'cooldown' };

    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(auditLog).values({
      id: nanoid(),
      tenantId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: RESEND_ACTIVATION_INVITE_ACTION,
      entityType: 'payment_attempt',
      entityId: input.attemptId,
      metadata: { memberId: row.memberId },
      createdAt: new Date(),
    });
    return { ok: true, email: row.email, memberId: row.memberId };
  });

  if (!('ok' in admission)) return admission;
  const invite = await sendMemberActivationInvite({ email: admission.email, tenantId });
  if (invite.sent) return { success: true, invite: 'sent' };
  console.error('Member activation invite resend failed', {
    userId: admission.memberId,
    reason: invite.reason,
  });
  return { success: false, error: 'delivery_failed' };
}
