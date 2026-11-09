import { createHash } from 'node:crypto';
import {
  and,
  auditLog,
  eq,
  sponsorHandoverIntents,
  type TenantTransaction,
} from '@interdomestik/database';

const ACTION = 'sponsor_intent.scheduled_cancel';

/** A fresh positive read-back hides retry escalation only through the newest locked attempt. */
export async function recordHandoverScheduleConfirmation(
  tx: TenantTransaction,
  tenantId: string,
  intentId: string,
  newestAttemptNo: number
): Promise<void> {
  const digest = createHash('sha256')
    .update(`${tenantId}|${intentId}|${newestAttemptNo}`)
    .digest('hex');
  await tx
    .insert(auditLog)
    .values({
      id: `sph-confirmed:${digest}`,
      tenantId,
      actorId: null,
      actorRole: 'system',
      action: 'sponsor_intent.schedule_confirmed',
      entityType: 'sponsor_handover_intent',
      entityId: intentId,
      metadata: { afterAttempt: newestAttemptNo },
    })
    .onConflictDoNothing({ target: auditLog.id });
}

/** One durable task identity per tenant, intent and provider effective instant, under the intent lock. */
export async function recordScheduledHandoverTask(
  tx: TenantTransaction,
  tenantId: string,
  intentId: string,
  effectiveAt: string
): Promise<void> {
  const at = new Date(effectiveAt).toISOString();
  const digest = createHash('sha256')
    .update(JSON.stringify([tenantId, intentId, at]))
    .digest('hex');
  await tx
    .insert(auditLog)
    .values({
      id: `sph-scheduled:${digest}`,
      tenantId,
      actorId: null,
      actorRole: 'system',
      action: ACTION,
      entityType: 'sponsor_handover_intent',
      entityId: intentId,
      metadata: { effectiveAt: at },
    })
    .onConflictDoNothing({ target: auditLog.id });
}

export type ScheduledHandoverTask = {
  kind: 'scheduled_cancel';
  taskId: string;
  intentId: string;
  userId: string;
  effectiveAt: Date;
};

/** Dated observations remain durable across administrative closure and repeat worker runs. */
export async function readScheduledHandoverTasks(
  tx: TenantTransaction,
  tenantId: string
): Promise<ScheduledHandoverTask[]> {
  const rows = await tx
    .select({
      taskId: auditLog.id,
      intentId: sponsorHandoverIntents.id,
      userId: sponsorHandoverIntents.userId,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .innerJoin(
      sponsorHandoverIntents,
      and(
        eq(sponsorHandoverIntents.tenantId, auditLog.tenantId),
        eq(sponsorHandoverIntents.id, auditLog.entityId)
      )
    )
    .where(
      and(
        eq(auditLog.tenantId, tenantId),
        eq(auditLog.action, ACTION),
        eq(auditLog.entityType, 'sponsor_handover_intent')
      )
    );
  return rows.flatMap(row => {
    const at = row.metadata?.effectiveAt;
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return [];
    return [
      {
        kind: 'scheduled_cancel' as const,
        taskId: row.taskId,
        intentId: row.intentId,
        userId: row.userId,
        effectiveAt: new Date(at),
      },
    ];
  });
}
