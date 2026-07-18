import { and, eq, sql } from 'drizzle-orm';

import { freeStartDrafts } from '../schema/free-start-drafts';
import type { TenantTransaction } from '../tenant';
import {
  draftValues,
  toFreeStartDraft,
  type DeleteFreeStartDraftInput,
  type DeleteFreeStartDraftResult,
  type FreeStartDraftContext,
  type UpdateFreeStartDraftInput,
  type UpdateFreeStartDraftResult,
} from './contracts';
import { insertFreeStartDraftAudit, withFreeStartDraftContext } from './context';

async function latestVisibleVersion(
  tx: TenantTransaction,
  context: FreeStartDraftContext,
  id: string
): Promise<number | null> {
  const [row] = await tx
    .select({ version: freeStartDrafts.version })
    .from(freeStartDrafts)
    .where(
      and(
        eq(freeStartDrafts.id, id),
        eq(freeStartDrafts.accessTenantId, context.accessTenantId),
        eq(freeStartDrafts.ownerUserId, context.ownerUserId)
      )
    )
    .limit(1);
  return row?.version ?? null;
}

export async function updateFreeStartDraft(
  context: FreeStartDraftContext,
  input: UpdateFreeStartDraftInput
): Promise<UpdateFreeStartDraftResult> {
  return withFreeStartDraftContext(context, async tx => {
    const [updated] = await tx
      .update(freeStartDrafts)
      .set({
        ...draftValues(input),
        updatedAt: sql`now()`,
        version: sql`${freeStartDrafts.version} + 1`,
      })
      .where(
        and(
          eq(freeStartDrafts.id, input.id),
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId),
          eq(freeStartDrafts.version, input.expectedVersion)
        )
      )
      .returning();
    if (!updated) {
      const latestVersion = await latestVisibleVersion(tx, context, input.id);
      return latestVersion === null
        ? { ok: false, code: 'notFound' }
        : { ok: false, code: 'conflict', latestVersion };
    }
    await insertFreeStartDraftAudit(
      tx,
      context,
      'free_start_draft.updated',
      updated.id,
      updated.version
    );
    return { ok: true, draft: toFreeStartDraft(updated) };
  });
}

export async function deleteFreeStartDraft(
  context: FreeStartDraftContext,
  input: DeleteFreeStartDraftInput
): Promise<DeleteFreeStartDraftResult> {
  return withFreeStartDraftContext(context, async tx => {
    const [deleted] = await tx
      .delete(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.id, input.id),
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId),
          eq(freeStartDrafts.version, input.expectedVersion)
        )
      )
      .returning({ id: freeStartDrafts.id, version: freeStartDrafts.version });
    if (!deleted) {
      const latestVersion = await latestVisibleVersion(tx, context, input.id);
      return latestVersion === null
        ? { ok: false, code: 'notFound' }
        : { ok: false, code: 'conflict', latestVersion };
    }
    await insertFreeStartDraftAudit(
      tx,
      context,
      'free_start_draft.deleted',
      deleted.id,
      deleted.version
    );
    return { ok: true, id: deleted.id, version: deleted.version };
  });
}
