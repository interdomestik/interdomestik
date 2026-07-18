import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { auditLog } from '../schema/notes';
import { withTenantContext, type TenantTransaction } from '../tenant';
import type { FreeStartDraftContext } from './contracts';

type DraftAuditAction =
  | 'free_start_draft.created'
  | 'free_start_draft.deleted'
  | 'free_start_draft.resumed'
  | 'free_start_draft.updated';

export async function withFreeStartDraftContext<T>(
  context: FreeStartDraftContext,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext(
    { tenantId: context.tenantId, accessTenantId: context.accessTenantId },
    async tx => {
      await tx.execute(
        sql`select set_config('app.current_actor_id', ${context.ownerUserId}, true)`
      );
      return action(tx);
    }
  );
}

export async function insertFreeStartDraftAudit(
  tx: TenantTransaction,
  context: FreeStartDraftContext,
  action: DraftAuditAction,
  draftId: string,
  version: number
): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: transaction already carries validated tenant, access-tenant, and actor RLS context
  await tx.insert(auditLog).values({
    id: randomUUID(),
    tenantId: context.accessTenantId,
    actorId: context.ownerUserId,
    actorRole: context.actorRole?.trim() || null,
    action,
    entityType: 'free_start_draft',
    entityId: draftId,
    metadata: { version },
  });
}
