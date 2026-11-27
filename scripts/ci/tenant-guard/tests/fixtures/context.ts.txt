import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { auditLog } from '../schema/notes';
import { withTenantContext, type TenantTransaction } from '../tenant';
import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from '../tenant-authority';
import { withTenantAuthority } from '../tenant-authority-context';
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

/** Binds the transaction-local actor settings to an authenticated session principal. */
export async function bindTenantTransactionPrincipal(
  tx: TenantTransaction,
  principal: Pick<TenantAuthorityPrincipal, 'userId' | 'role' | 'branchId'>
) {
  const { userId, role, branchId } = principal;
  if (!role) throw new Error('Session principal required');
  await tx.execute(sql`
    select set_config('app.current_actor_id', ${userId}, true),
           set_config('app.current_actor_role', ${role}, true),
           set_config('app.current_actor_branch_id', ${branchId ?? ''}, true)
  `);
}

export async function withPrincipalTenantContext<T>(
  authority: TenantAuthority,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  const { principal, purpose } = readTenantAuthority(authority);
  if (purpose !== 'session' || !principal?.role) {
    throw new Error('Session principal required');
  }
  return withTenantAuthority(authority, async tx => {
    await bindTenantTransactionPrincipal(tx, principal);
    return action(tx);
  });
}
