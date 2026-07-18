import { and, eq, sql } from 'drizzle-orm';

import { freeStartDrafts } from '../schema/free-start-drafts';
import {
  draftValues,
  toFreeStartDraft,
  type CreateFreeStartDraftInput,
  type CreateFreeStartDraftResult,
  type FreeStartDraftContext,
} from './contracts';
import { insertFreeStartDraftAudit, withFreeStartDraftContext } from './context';

const DRAFT_LIMIT = 200;

export async function createFreeStartDraft(
  context: FreeStartDraftContext,
  input: CreateFreeStartDraftInput
): Promise<CreateFreeStartDraftResult> {
  return withFreeStartDraftContext(context, async tx => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${context.ownerUserId}, 0))`
    );

    const [existing] = await tx
      .select()
      .from(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId),
          eq(freeStartDrafts.clientRequestId, input.clientRequestId)
        )
      )
      .limit(1);
    if (existing) {
      return { ok: true, draft: toFreeStartDraft(existing), idempotent: true };
    }

    const [total] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId)
        )
      );
    if ((total?.count ?? 0) >= DRAFT_LIMIT) return { ok: false, code: 'limitReached' };

    const [created] = await tx
      .insert(freeStartDrafts)
      .values({
        ...draftValues(input),
        accessTenantId: context.accessTenantId,
        clientRequestId: input.clientRequestId,
        ownerUserId: context.ownerUserId,
        tenantId: context.tenantId,
      })
      .returning();
    if (!created) throw new Error('free-start draft create returned no row');
    await insertFreeStartDraftAudit(
      tx,
      context,
      'free_start_draft.created',
      created.id,
      created.version
    );
    return { ok: true, draft: toFreeStartDraft(created), idempotent: false };
  });
}
