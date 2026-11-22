import type { TenantTransaction } from '@interdomestik/database';
import { notificationDeliveries as deliveries } from '@interdomestik/database/schema';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { recordDeliveryAudit } from './store';

const currentAccessTenant = sql<string>`(select current_setting('app.current_access_tenant_id', true))::text`;
const tenantScope = eq(deliveries.tenantId, currentAccessTenant);

type FailedCursor = { createdAt: string; id: string };

export async function listFailedNotificationDeliveries(
  tx: TenantTransaction,
  { limit, cursor }: { limit: number; cursor?: FailedCursor }
) {
  const pageSize = Math.min(limit, 50);
  const rows = await tx
    .select({
      id: deliveries.id,
      kind: deliveries.kind,
      channel: deliveries.channel,
      claimId: deliveries.claimId,
      attempts: deliveries.attempts,
      createdAt: sql<string>`to_char(${deliveries.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      terminalAt: deliveries.terminalAt,
      transport: deliveries.transport,
      lastErrorCode: deliveries.lastErrorCode,
      lastErrorDetail: deliveries.lastErrorDetail,
    })
    .from(deliveries)
    .where(
      and(
        tenantScope,
        eq(deliveries.state, 'failed'),
        cursor &&
          or(
            lt(deliveries.createdAt, cursor.createdAt),
            and(eq(deliveries.createdAt, cursor.createdAt), lt(deliveries.id, cursor.id))
          )
      )
    )
    .orderBy(desc(deliveries.createdAt), desc(deliveries.id))
    .limit(pageSize + 1);

  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  return {
    items,
    cursor: rows.length > pageSize && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function redriveNotificationDelivery(
  tx: TenantTransaction,
  id: string,
  actor?: { actorId: string; actorRole?: string }
) {
  const [row] = await tx
    .update(deliveries)
    .set({
      state: 'queued',
      attempts: 0,
      terminalAt: null,
      lastErrorCode: null,
      lastErrorDetail: null,
      avoidTransport: null,
      nextAttemptAt: sql`clock_timestamp()`,
    })
    .where(and(tenantScope, eq(deliveries.id, id), eq(deliveries.state, 'failed')))
    .returning({
      id: deliveries.id,
      kind: deliveries.kind,
      tenantId: deliveries.tenantId,
    });
  if (!row) return false;
  await recordDeliveryAudit(tx, row, 'notification.delivery_redriven', actor ?? {});
  return true;
}
