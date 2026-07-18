import { and, desc, eq, lt, or } from 'drizzle-orm';

import { freeStartDrafts } from '../schema/free-start-drafts';
import {
  toFreeStartDraft,
  type FreeStartDraft,
  type FreeStartDraftContext,
  type ListFreeStartDraftOptions,
  type ReadFreeStartDraftResult,
} from './contracts';
import { insertFreeStartDraftAudit, withFreeStartDraftContext } from './context';

export async function listFreeStartDrafts(
  context: FreeStartDraftContext,
  options: ListFreeStartDraftOptions = {}
): Promise<{
  items: FreeStartDraft[];
  nextCursor: { id: string; updatedAt: string } | null;
}> {
  return withFreeStartDraftContext(context, async tx => {
    const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 20)));
    const cursorDate = options.cursor ? new Date(options.cursor.updatedAt) : null;
    const cursorScope =
      options.cursor && cursorDate
        ? or(
            lt(freeStartDrafts.updatedAt, cursorDate),
            and(
              eq(freeStartDrafts.updatedAt, cursorDate),
              lt(freeStartDrafts.id, options.cursor.id)
            )
          )
        : undefined;
    const rows = await tx
      .select()
      .from(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId),
          cursorScope
        )
      )
      .orderBy(desc(freeStartDrafts.updatedAt), desc(freeStartDrafts.id))
      .limit(limit + 1);
    const visibleRows = rows.slice(0, limit);
    const items = visibleRows.map(toFreeStartDraft);
    const last = rows.length > limit ? items.at(-1) : null;
    return {
      items,
      nextCursor: last ? { id: last.id, updatedAt: last.updatedAt } : null,
    };
  });
}

export async function resumeFreeStartDraft(
  context: FreeStartDraftContext,
  id: string
): Promise<ReadFreeStartDraftResult> {
  return withFreeStartDraftContext(context, async tx => {
    const [row] = await tx
      .select()
      .from(freeStartDrafts)
      .where(
        and(
          eq(freeStartDrafts.id, id),
          eq(freeStartDrafts.accessTenantId, context.accessTenantId),
          eq(freeStartDrafts.ownerUserId, context.ownerUserId)
        )
      )
      .limit(1);
    if (!row) return { ok: false, code: 'notFound' };
    await insertFreeStartDraftAudit(tx, context, 'free_start_draft.resumed', row.id, row.version);
    return { ok: true, draft: toFreeStartDraft(row) };
  });
}
