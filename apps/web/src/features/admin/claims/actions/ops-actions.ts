'use server';

import { and, auditLog, claimMessages, desc, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { nanoid } from 'nanoid';
import {
  assertCanMutateClaim,
  getClaimForMutation,
  getOpsMutationContext,
  lockClaimForOpsMutation,
  logAudit,
  OpsActionResponse,
  revalidateClaim,
} from './action-helpers';
import {
  completeCommittedOpsAction,
  OPS_ACTION_UNAUTHORIZED_ERROR,
  toSafeOpsActionError,
} from './ops-action-outcome';
import { assignOwnerAction, unassignOwnerAction } from './ops-assignment-action';
import { updateStatusAction, type OpsStatusOptions } from './ops-status-action';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const INVALID_REMINDER_CHANNEL_ERROR = 'Invalid reminder channel';
const REMINDER_CHANNELS: ReadonlySet<string> = new Set(['email', 'sms']);
const REMINDER_COOLDOWN_MINUTES = 10;

type ReminderTransactionOutcome = { recorded: true } | { recorded: false; error: string };

export async function assignOwner(
  claimId: string,
  staffId: string,
  locale: string
): Promise<OpsActionResponse> {
  return assignOwnerAction(claimId, staffId, locale);
}

export async function unassignOwner(claimId: string, locale: string): Promise<OpsActionResponse> {
  return unassignOwnerAction(claimId, locale);
}

export async function updateStatus(
  claimId: string,
  newStatus: ClaimStatus,
  locale: string,
  options?: OpsStatusOptions
): Promise<OpsActionResponse> {
  return updateStatusAction(claimId, newStatus, locale, options);
}

export async function markSlaAcknowledged(
  claimId: string,
  locale: string
): Promise<OpsActionResponse> {
  try {
    // Exercised admin-family role is checked before any claim read or tenant transaction.
    const ctx = await getOpsMutationContext();
    if (!ctx) return { success: false, error: OPS_ACTION_UNAUTHORIZED_ERROR };
    const authorized = await authorizeSessionTenant();
    if (!authorized) return { success: false, error: OPS_ACTION_UNAUTHORIZED_ERROR };

    // Claim read, internal acknowledgement note and audit share one tenant transaction.
    await withTenantAuthority(authorized.authority, async tx => {
      // Keep terminal eligibility valid through the acknowledgement commit.
      await lockClaimForOpsMutation(tx, claimId, ctx.tenantId);
      const claim = await getClaimForMutation(claimId, ctx.tenantId, tx);
      assertCanMutateClaim(claim, ctx.actorRole, 'sla_ack');

      // db-access-guard: tenant-scoped -- reason: trusted access tenant of the enclosing tenant transaction
      await tx.insert(claimMessages).values({
        id: nanoid(),
        tenantId: ctx.tenantId,
        claimId,
        senderId: ctx.actorId,
        content: '⚡ SLA Breach Acknowledged',
        isInternal: true,
        createdAt: new Date(),
      });

      await logAudit(ctx.tenantId, ctx.actorId, 'acknowledge_sla', claimId, {}, tx);
    });

    return completeCommittedOpsAction('markSlaAcknowledged', () =>
      revalidateClaim(locale, claimId)
    );
  } catch (error: unknown) {
    return toSafeOpsActionError('markSlaAcknowledged', error);
  }
}

export async function sendMemberReminder(
  claimId: string,
  channel: 'email' | 'sms' = 'email',
  locale: string
): Promise<OpsActionResponse> {
  try {
    // Exercised admin-family role is checked before any claim read or tenant transaction.
    const ctx = await getOpsMutationContext();
    if (!ctx) return { success: false, error: OPS_ACTION_UNAUTHORIZED_ERROR };
    // Runtime input from the client is untrusted even though the parameter is typed.
    if (typeof channel !== 'string' || !REMINDER_CHANNELS.has(channel)) {
      return { success: false, error: INVALID_REMINDER_CHANNEL_ERROR };
    }
    const authorized = await authorizeSessionTenant();
    if (!authorized) return { success: false, error: OPS_ACTION_UNAUTHORIZED_ERROR };

    // Records an internal follow-up note and audit only; no email/SMS provider is called here.
    const outcome = await withTenantAuthority<ReminderTransactionOutcome>(
      authorized.authority,
      async tx => {
        // Row lock serializes cooldown eligibility per claim so concurrent attempts cannot both
        // pass the window; the rate-limit read, note and audit then commit or roll back together.
        await lockClaimForOpsMutation(tx, claimId, ctx.tenantId);
        const claim = await getClaimForMutation(claimId, ctx.tenantId, tx);
        assertCanMutateClaim(claim, ctx.actorRole, 'poke');

        const lastPoke = await tx.query.auditLog.findFirst({
          where: and(
            eq(auditLog.entityId, claimId),
            eq(auditLog.action, 'send_reminder'),
            eq(auditLog.tenantId, ctx.tenantId)
          ),
          orderBy: [desc(auditLog.createdAt)],
        });

        if (lastPoke?.createdAt) {
          const minutes = Math.floor((Date.now() - lastPoke.createdAt.getTime()) / 60_000);
          if (minutes < REMINDER_COOLDOWN_MINUTES) {
            return {
              recorded: false,
              error: `Rate limited. Last reminder recorded ${minutes} minutes ago.`,
            };
          }
        }

        // db-access-guard: tenant-scoped -- reason: trusted access tenant of the enclosing tenant transaction
        await tx.insert(claimMessages).values({
          id: nanoid(),
          tenantId: ctx.tenantId,
          claimId,
          senderId: ctx.actorId,
          content: `📤 ${channel} reminder recorded for member follow-up (no automatic delivery).`,
          isInternal: true,
          createdAt: new Date(),
        });
        await logAudit(
          ctx.tenantId,
          ctx.actorId,
          'send_reminder',
          claimId,
          { channel, delivery: 'internal_record_only' },
          tx
        );
        return { recorded: true };
      }
    );

    if (!outcome.recorded) return { success: false, error: outcome.error };
    return completeCommittedOpsAction('sendMemberReminder', () => revalidateClaim(locale, claimId));
  } catch (error: unknown) {
    return toSafeOpsActionError('sendMemberReminder', error);
  }
}
