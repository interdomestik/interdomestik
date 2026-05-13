import type { CrmActorContext } from '../context';
import type { CrmAccountCreatedEvent } from '../outbox/types';
import type { CrmAccountRepository } from './repository';
import type { CrmAccount } from './types';

export type CrmAccountClock = {
  now(): string;
};

export type CrmAccountIds = {
  accountId(): string;
};

export type CreateCrmAccountInput = {
  actor: CrmActorContext;
  domain?: string | null;
  name: string;
  ownerAgentId?: string | null;
  phone?: string | null;
  source?: string | null;
  tenantId: string;
  website?: string | null;
};

export type CrmAccountMutationResult =
  | { success: true; account: CrmAccount; event: CrmAccountCreatedEvent }
  | {
      success: false;
      error: 'forbidden';
      reason: 'agent_scope' | 'branch_scope' | 'role_scope' | 'tenant_scope';
    }
  | { success: false; error: 'invalid_input'; reason: 'invalid_name' };

function authorizeAgentCreate(
  actor: CrmActorContext,
  tenantId: string
): Exclude<CrmAccountMutationResult, { success: true }> | null {
  if (actor.role !== 'agent') return { success: false, error: 'forbidden', reason: 'role_scope' };
  if (actor.tenantId !== tenantId) {
    return { success: false, error: 'forbidden', reason: 'tenant_scope' };
  }
  if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) {
    return { success: false, error: 'forbidden', reason: 'agent_scope' };
  }
  if (!actor.scope.branchId) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }
  return null;
}

export async function createCrmAccount(
  input: CreateCrmAccountInput,
  repository: Pick<CrmAccountRepository, 'createAccount'>,
  services: { clock: CrmAccountClock; ids: CrmAccountIds }
): Promise<CrmAccountMutationResult> {
  const name = input.name.trim();
  if (!name) return { success: false, error: 'invalid_input', reason: 'invalid_name' };

  const denied = authorizeAgentCreate(input.actor, input.tenantId);
  if (denied) return denied;

  const branchId = input.actor.scope.branchId!;
  const now = services.clock.now();
  const account: CrmAccount = {
    archivedAt: null,
    archivedById: null,
    branchId,
    createdAt: now,
    domain: input.domain?.trim() || undefined,
    id: services.ids.accountId(),
    name,
    ownerAgentId: input.ownerAgentId?.trim() || input.actor.actorId,
    phone: input.phone?.trim() || undefined,
    source: input.source?.trim() || undefined,
    tenantId: input.tenantId,
    updatedAt: now,
    website: input.website?.trim() || undefined,
  };
  const created = await repository.createAccount({ account });

  return {
    account: created,
    event: {
      actor: {
        actorId: input.actor.actorId,
        branchId,
        role: input.actor.role,
        tenantId: input.actor.tenantId,
      },
      aggregateId: created.id,
      aggregateType: 'account',
      occurredAt: now,
      payload: {
        accountId: created.id,
        branchId: created.branchId,
        name: created.name,
        ownerAgentId: created.ownerAgentId ?? null,
      },
      tenantId: created.tenantId,
      type: 'crm.account.created',
    },
    success: true,
  };
}
