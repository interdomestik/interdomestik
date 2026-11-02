import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { ensureTenantId, type SessionWithTenant } from '@interdomestik/shared-auth';
import {
  CRM_ACTOR_ROLES,
  type CrmActorContext,
  type CrmActorRole,
} from '@interdomestik/domain-crm/context';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { createCrmTaskRepository } from '@/adapters/crm/task-repository';
import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { RateLimitResult } from '@/lib/rate-limit.core';
import type {
  CrmTaskBoundaryOutcome,
  CrmTaskBoundaryResult,
  CrmTaskCoreDeps,
  CoreParams,
  MutationContext,
} from './crm-tasks.core';

export const MUTATION_LIMIT = 30;

export const MUTATION_WINDOW_SECONDS = 60;

export const defaultDeps: Omit<Required<CrmTaskCoreDeps>, 'repository'> = {
  audit: logAuditEvent,
  now: () => new Date().toISOString(),
  rateLimit: enforceRateLimitForAction,
  revalidate: revalidatePath,
  taskId: nanoid,
};

export function mergeDeps(
  deps: CrmTaskCoreDeps | undefined,
  authority: TenantAuthority
): Required<CrmTaskCoreDeps> {
  return { ...defaultDeps, repository: createCrmTaskRepository(authority), ...deps };
}

export function failure(
  outcome: Exclude<CrmTaskBoundaryOutcome, 'success' | 'idempotent_replay' | 'rate_limited'>,
  reason: string
): CrmTaskBoundaryResult {
  return { outcome, reason };
}

export function isCrmActorRole(role: unknown): role is CrmActorRole {
  return typeof role === 'string' && (CRM_ACTOR_ROLES as readonly string[]).includes(role);
}

export function normalizeCrmActorRole(role: unknown): CrmActorRole | null {
  if (role === 'tenant_admin' || role === 'super_admin') return 'admin';
  return isCrmActorRole(role) ? role : null;
}

export function createActorContext(
  session: SessionWithTenant
): CrmActorContext | CrmTaskBoundaryResult {
  if (!session?.user?.id) return failure('unauthorized', 'missing_session');

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    return failure('unauthorized', 'missing_session');
  }

  const role = normalizeCrmActorRole(session.user.role);
  if (!role) return failure('forbidden', 'role_scope');
  if (role === 'member') return failure('forbidden', 'role_scope');

  return {
    actorId: session.user.id,
    role,
    scope: {
      agentId: session.user.agentId ?? (role === 'agent' ? session.user.id : null),
      branchId: session.user.branchId ?? null,
      memberId: null,
      staffId:
        role === 'staff' || role === 'branch_manager' || role === 'admin' ? session.user.id : null,
    },
    tenantId,
  };
}

export function mapRateLimit(limit: RateLimitResult): CrmTaskBoundaryResult | null {
  if (!limit.limited) return null;
  return {
    outcome: 'rate_limited',
    reason: 'rate_limited',
    retryAfter: limit.retryAfter,
  };
}

export async function createMutationContext(params: CoreParams): Promise<MutationContext> {
  const actor = createActorContext(params.session);
  if ('outcome' in actor) return actor;
  if (!params.authority) return failure('unauthorized', 'missing_session');

  const deps = mergeDeps(params.deps, params.authority);
  const requestHeaders = params.requestHeaders ?? new Headers();
  const limit = await deps.rateLimit({
    headers: requestHeaders,
    keySuffix: actor.actorId,
    limit: MUTATION_LIMIT,
    name: 'action:crm-tasks',
    productionSensitive: true,
    windowSeconds: MUTATION_WINDOW_SECONDS,
  });
  const rateLimited = mapRateLimit(limit);
  if (rateLimited) return rateLimited;

  return { actor, authority: params.authority, deps, requestHeaders };
}
