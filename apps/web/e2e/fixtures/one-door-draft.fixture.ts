import { randomUUID } from 'node:crypto';
import {
  db,
  eq,
  freeStartDrafts,
  E2E_USER_IDS,
  E2E_USERS,
  type E2EUserKey,
} from '@interdomestik/database';
import {
  createFreeStartDraft,
  deleteFreeStartDraft,
  resumeFreeStartDraft,
  type FreeStartDraft,
  type FreeStartDraftContext,
} from '@interdomestik/database/free-start-drafts';
import { expect } from '@playwright/test';
import { requireDoorActor } from './one-door-data.fixture';

export async function doorDraftRow(
  id: string
): Promise<typeof freeStartDrafts.$inferSelect | undefined> {
  return db.query.freeStartDrafts.findFirst({ where: eq(freeStartDrafts.id, id) });
}

export function doorDraftContext(actor: E2EUserKey): FreeStartDraftContext {
  const tenantId = E2E_USERS[actor].tenantId;
  return {
    ownerUserId: E2E_USER_IDS[actor],
    actorRole: 'member',
    tenantId,
    accessTenantId: tenantId,
  };
}

export async function withDoorDraft(
  actor: E2EUserKey,
  run: (draft: FreeStartDraft, context: FreeStartDraftContext) => Promise<void>
): Promise<void> {
  await requireDoorActor(actor);
  const context = doorDraftContext(actor);
  const result = await createFreeStartDraft(context, {
    clientRequestId: randomUUID(),
    category: 'vehicle',
    issueType: 'collision',
    incidentDate: '2026-11-01',
    counterparty: 'Door fixture insurer',
    desiredOutcome: 'repair',
    resumeStep: 'details',
    summary: `Door draft ${randomUUID()}`,
  });
  if (!result.ok) throw new Error(`Door draft setup failed: ${result.code}`);
  try {
    await run(result.draft, context);
  } finally {
    const current = await resumeFreeStartDraft(context, result.draft.id);
    if (!current.ok) throw new Error('Exact door draft disappeared before cleanup');
    expect(
      await deleteFreeStartDraft(context, {
        id: current.draft.id,
        expectedVersion: current.draft.version,
      })
    ).toMatchObject({ ok: true, id: result.draft.id });
    expect(await resumeFreeStartDraft(context, result.draft.id)).toEqual({
      ok: false,
      code: 'notFound',
    });
  }
}
