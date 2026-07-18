import {
  createFreeStartDraft,
  deleteFreeStartDraft,
  listFreeStartDrafts,
  resumeFreeStartDraft,
  updateFreeStartDraft,
  type FreeStartDraftContext,
  type FreeStartDraftFacts,
} from '@interdomestik/database/free-start-drafts';
import { z } from 'zod';

import { freeStartDraftPayloadSchema } from '@/lib/validators/free-start-draft';

import { resolveFreeStartDraftSession } from './session.core';

const createSchema = freeStartDraftPayloadSchema.safeExtend({
  clientRequestId: z.string().uuid(),
});
const updateSchema = freeStartDraftPayloadSchema.safeExtend({
  expectedVersion: z.number().int().positive(),
  id: z.string().uuid(),
});
const idSchema = z.strictObject({ id: z.string().uuid() });
const deleteSchema = idSchema.extend({ expectedVersion: z.number().int().positive() });
const cursorSchema = z.strictObject({ id: z.string().uuid(), updatedAt: z.string().datetime() });
const listSchema = z.strictObject({
  cursor: cursorSchema.nullable().optional(),
});

export type FreeStartDraftLifecycleDependencies = {
  createDraft: typeof createFreeStartDraft;
  deleteDraft: typeof deleteFreeStartDraft;
  listDrafts: typeof listFreeStartDrafts;
  resolveSession: typeof resolveFreeStartDraftSession;
  resumeDraft: typeof resumeFreeStartDraft;
  updateDraft: typeof updateFreeStartDraft;
};

const defaultDependencies: FreeStartDraftLifecycleDependencies = {
  createDraft: createFreeStartDraft,
  deleteDraft: deleteFreeStartDraft,
  listDrafts: listFreeStartDrafts,
  resolveSession: resolveFreeStartDraftSession,
  resumeDraft: resumeFreeStartDraft,
  updateDraft: updateFreeStartDraft,
};

type BoundaryFailure = {
  ok: false;
  code: 'authRequired' | 'invalid' | 'unavailable' | 'unavailableAccountContext';
};

function facts(input: z.infer<typeof freeStartDraftPayloadSchema>): FreeStartDraftFacts {
  return {
    category: input.category,
    counterparty: input.counterparty ?? null,
    desiredOutcome: input.desiredOutcome ?? null,
    incidentDate: input.incidentDate ?? null,
    issueType: input.issueType ?? null,
    resumeStep: input.resumeStep,
    summary: input.summary ?? null,
  };
}

async function withFreshContext<T>(
  requestHeaders: Headers,
  dependencies: FreeStartDraftLifecycleDependencies,
  operation: (context: FreeStartDraftContext) => Promise<T>
): Promise<T | BoundaryFailure> {
  const session = await dependencies.resolveSession(requestHeaders);
  if (!session.ok) return session;
  try {
    return await operation(session.context);
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

export async function createFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  const { clientRequestId } = parsed.data;
  return withFreshContext(requestHeaders, dependencies, context =>
    dependencies.createDraft(context, { ...facts(parsed.data), clientRequestId })
  );
}

export async function listFreeStartDraftsCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return withFreshContext(requestHeaders, dependencies, async context => ({
    ok: true as const,
    ...(await dependencies.listDrafts(context, { ...parsed.data, limit: 20 })),
  }));
}

export async function resumeFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return withFreshContext(requestHeaders, dependencies, context =>
    dependencies.resumeDraft(context, parsed.data.id)
  );
}

export async function updateFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  const { expectedVersion, id } = parsed.data;
  return withFreshContext(requestHeaders, dependencies, context =>
    dependencies.updateDraft(context, { ...facts(parsed.data), expectedVersion, id })
  );
}

export async function deleteFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return withFreshContext(requestHeaders, dependencies, context =>
    dependencies.deleteDraft(context, parsed.data)
  );
}
