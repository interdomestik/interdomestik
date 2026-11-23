import {
  createFreeStartDraft,
  deleteFreeStartDraft,
  listFreeStartDrafts,
  readFreeStartDraftIntakeOpen,
  resumeFreeStartDraft,
  updateFreeStartDraft,
  type FreeStartDraftContext,
  type FreeStartDraftFacts,
} from '@interdomestik/database/free-start-drafts';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { hasActiveMembership } from '@interdomestik/domain-membership-billing/subscription';
import * as Sentry from '@sentry/nextjs';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { isPublicIntakeOpenForTenant } from '@/lib/tenant/public-intake-admission';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';
import { freeStartDraftPayloadSchema } from '@/lib/validators/free-start-draft';

import { resolveFreeStartDraftSession, type FreeStartDraftSessionResult } from './session.core';

/**
 * The account/tenant the client believes it captured. It is compared against fresh server
 * authority and never substituted for it, so a stale or forged capture can only fail closed.
 */
const expectedContextSchema = z.strictObject({
  ownerUserId: z.string().trim().min(1).max(128),
  tenantId: z.string().trim().min(1).max(128),
});

export type FreeStartDraftExpectedContext = z.infer<typeof expectedContextSchema>;

const createSchema = freeStartDraftPayloadSchema.safeExtend({
  clientRequestId: z.string().uuid(),
  expectedContext: expectedContextSchema,
});
const updateSchema = freeStartDraftPayloadSchema.safeExtend({
  expectedContext: expectedContextSchema,
  expectedVersion: z.number().int().positive(),
  id: z.string().uuid(),
});
const idSchema = z.strictObject({ id: z.string().uuid() });
const resumeSchema = idSchema.extend({ expectedContext: expectedContextSchema.optional() });
const deleteSchema = idSchema.extend({ expectedVersion: z.number().int().positive() });
const cursorSchema = z.strictObject({ id: z.string().uuid(), updatedAt: z.string().datetime() });
const listSchema = z.strictObject({
  expectedContext: expectedContextSchema.optional(),
  cursor: cursorSchema.nullable().optional(),
});

export type FreeStartDraftLifecycleDependencies = {
  createDraft: typeof createFreeStartDraft;
  deleteDraft: typeof deleteFreeStartDraft;
  hasClaimEntitlement: (context: FreeStartDraftContext) => Promise<boolean>;
  listDrafts: typeof listFreeStartDrafts;
  readIntakeOpen: typeof readFreeStartDraftIntakeOpen;
  readPublicIntakeOpen: () => Promise<boolean>;
  resolveSession: typeof resolveFreeStartDraftSession;
  resumeDraft: typeof resumeFreeStartDraft;
  updateDraft: typeof updateFreeStartDraft;
};

const defaultDependencies: FreeStartDraftLifecycleDependencies = {
  createDraft: createFreeStartDraft,
  deleteDraft: deleteFreeStartDraft,
  async hasClaimEntitlement(context) {
    const authority = await authorizeSessionUserTenant(context.ownerUserId);
    if (!authority) return false;
    const { tenantId, accessTenantId } = readTenantAuthority(authority);
    if (tenantId !== context.tenantId || accessTenantId !== context.accessTenantId) return false;
    return hasActiveMembership(context.ownerUserId, authority);
  },
  listDrafts: listFreeStartDrafts,
  readIntakeOpen: readFreeStartDraftIntakeOpen,
  async readPublicIntakeOpen() {
    const tenantId = resolveDefaultPublicTenantId();
    return tenantId ? isPublicIntakeOpenForTenant(tenantId) : false;
  },
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

function compareExpectedContext(
  fresh: FreeStartDraftContext,
  expectedContext: FreeStartDraftExpectedContext
): BoundaryFailure | null {
  if (
    expectedContext.ownerUserId !== fresh.ownerUserId ||
    expectedContext.tenantId !== fresh.tenantId ||
    expectedContext.tenantId !== fresh.accessTenantId
  ) {
    return { ok: false, code: 'unavailableAccountContext' };
  }
  return null;
}

async function withFreshContext<T>(
  requestHeaders: Headers,
  dependencies: FreeStartDraftLifecycleDependencies,
  operation: (context: FreeStartDraftContext) => Promise<T>,
  expectedContext?: FreeStartDraftExpectedContext,
  admission: 'write' | 'read' = 'write'
): Promise<T | BoundaryFailure> {
  const session = await dependencies.resolveSession(requestHeaders);
  if (!session.ok) return session;
  return runWithContext(session, operation, expectedContext, admission);
}

async function runWithContext<T>(
  session: Extract<FreeStartDraftSessionResult, { ok: true }>,
  operation: (context: FreeStartDraftContext) => Promise<T>,
  expectedContext?: FreeStartDraftExpectedContext,
  admission: 'write' | 'read' = 'write'
): Promise<T | BoundaryFailure> {
  if (expectedContext) {
    if (admission === 'write' && session.emailVerified !== true) {
      return { ok: false, code: 'authRequired' };
    }
    const refused = compareExpectedContext(session.context, expectedContext);
    if (refused) return refused;
  }
  try {
    return await operation(session.context);
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

async function draftIntakeClosed() {
  const t = await getTranslations('freeStart');
  return { ok: false, code: 'CLOSED', error: t('draft.CLOSED') } as const;
}

async function withDraftWriteAdmission<T>(
  requestHeaders: Headers,
  dependencies: FreeStartDraftLifecycleDependencies,
  operation: (session: Extract<FreeStartDraftSessionResult, { ok: true }>) => Promise<T>
) {
  const session = await dependencies.resolveSession(requestHeaders);
  if (!session.ok) {
    if (session.code === 'authRequired' && !(await dependencies.readPublicIntakeOpen())) {
      return draftIntakeClosed();
    }
    return session;
  }

  let open = false;
  try {
    open =
      (session.emailVerified === true &&
        (await dependencies.hasClaimEntitlement(session.context))) ||
      (await dependencies.readIntakeOpen(session.context));
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'pilot.freeStartDraftIntake' } });
  }
  if (!open) return draftIntakeClosed();
  return operation(session);
}

/**
 * Presentation-only verdict for the account draft queue. It grants nothing: every mutation
 * resolves fresh authority again and re-checks verification before touching the repository.
 */
export async function getFreeStartDraftAccountCore(
  requestHeaders: Headers,
  dependencies = defaultDependencies
) {
  const session = await dependencies.resolveSession(requestHeaders);
  if (!session.ok) return session;
  return {
    ok: true as const,
    emailVerified: session.emailVerified === true,
    expectedContext: {
      ownerUserId: session.context.ownerUserId,
      tenantId: session.context.tenantId,
    },
  };
}

export async function createFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  return withDraftWriteAdmission(requestHeaders, dependencies, async session => {
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'invalid' } as const;
    }
    const { clientRequestId } = parsed.data;
    return runWithContext(
      session,
      context => dependencies.createDraft(context, { ...facts(parsed.data), clientRequestId }),
      parsed.data.expectedContext
    );
  });
}

export async function listFreeStartDraftsCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  const { expectedContext, ...pagination } = parsed.data;
  return withFreshContext(
    requestHeaders,
    dependencies,
    async context => ({
      ok: true as const,
      ...(await dependencies.listDrafts(context, { ...pagination, limit: 20 })),
      expectedContext: { ownerUserId: context.ownerUserId, tenantId: context.tenantId },
    }),
    expectedContext,
    'read'
  );
}

export async function resumeFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  const parsed = resumeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'invalid' } as const;
  return withFreshContext(
    requestHeaders,
    dependencies,
    async context => {
      const result = await dependencies.resumeDraft(context, parsed.data.id);
      return result.ok
        ? {
            ...result,
            expectedContext: { ownerUserId: context.ownerUserId, tenantId: context.tenantId },
          }
        : result;
    },
    parsed.data.expectedContext,
    'read'
  );
}

export async function updateFreeStartDraftCore(
  requestHeaders: Headers,
  input: unknown,
  dependencies = defaultDependencies
) {
  return withDraftWriteAdmission(requestHeaders, dependencies, async session => {
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, code: 'invalid' } as const;
    }
    const { expectedVersion, id } = parsed.data;
    return runWithContext(
      session,
      context => dependencies.updateDraft(context, { ...facts(parsed.data), expectedVersion, id }),
      parsed.data.expectedContext
    );
  });
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
