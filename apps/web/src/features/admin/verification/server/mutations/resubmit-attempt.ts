import type { ProtectedActionContext } from '@/lib/safe-action';
import { actionFailure } from '../../../../../lib/safe-action.failure';

import { auditLog, leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { assertLeadSalesOpen } from '@interdomestik/domain-leads/sales-admission';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { resubmitCashSchema } from '../schemas';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

// 4. Action: Resubmit (Agent)
export async function resubmitCashAttemptCore(
  ctx: Pick<ProtectedActionContext, 'tenantId' | 'session' | 'authority'>,
  input: z.infer<typeof resubmitCashSchema>
) {
  const { tenantId, session, authority } = ctx;
  const { attemptId, note } = input;

  return await withTenantAuthority(authority, async tx => {
    const version = sql<string>`${leadPaymentAttempts.updatedAt}::text`;
    // A. Fetch
    const [result] = await tx
      .select({
        attempt: leadPaymentAttempts,
        versionToken: version,
        lead: memberLeads,
      })
      .from(leadPaymentAttempts)
      .innerJoin(
        memberLeads,
        and(eq(leadPaymentAttempts.leadId, memberLeads.id), eq(memberLeads.tenantId, tenantId))
      )
      .where(
        and(
          eq(leadPaymentAttempts.id, attemptId),
          eq(leadPaymentAttempts.tenantId, tenantId),
          eq(leadPaymentAttempts.method, 'cash')
        )
      )
      .limit(1);

    if (!result) throw new Error('Payment attempt not found.');
    const { attempt, versionToken, lead } = result;

    // B. Security: Only assigned agent
    if (lead.agentId !== session.user.id) {
      throw new Error('Only the assigned agent can resubmit this verification.');
    }

    // C. Validation
    if (attempt.status !== 'needs_info' && attempt.status !== 'rejected') {
      throw new Error(`Cannot resubmit verification with status: ${attempt.status}`);
    }
    await assertLeadSalesOpen(tx, tenantId);

    // D. Compare-and-set: only the winner may write the resubmission audit.
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const resubmitted = await tx
      .update(leadPaymentAttempts)
      .set({
        status: 'pending',
        isResubmission: true, // SET FLAG
        updatedAt: sql`greatest(clock_timestamp(), ${leadPaymentAttempts.updatedAt} + interval '1 microsecond')`,
        // verificationNote: Do not clear admin note? Or clear it?
        // Usually we keep admin note so history shows "Why it was rejected".
        // But status is now pending.
        // I'll keep it.
      })
      .where(
        and(
          eq(leadPaymentAttempts.id, attemptId),
          eq(leadPaymentAttempts.tenantId, tenantId),
          eq(leadPaymentAttempts.status, attempt.status),
          eq(version, versionToken)
        )
      )
      .returning({ id: leadPaymentAttempts.id });
    if (resubmitted.length === 0) {
      throw actionFailure('CONFLICT');
    }

    // E. Audit
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await tx.insert(auditLog).values({
      id: nanoid(),
      tenantId,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'PAYMENT_RESUBMITTED',
      entityType: 'payment_attempt',
      entityId: attemptId,
      metadata: {
        note,
        previousStatus: attempt.status,
      },
      createdAt: new Date(),
    });

    return { success: true };
  });
}
