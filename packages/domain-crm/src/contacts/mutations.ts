import type { CrmActorContext } from '../context';
import type { CrmContactCreatedEvent } from '../outbox/types';
import type { CrmContactRepository } from './repository';
import {
  CRM_ACCOUNT_CONTACT_ROLES,
  type CrmAccountContact,
  type CrmAccountContactRole,
  type CrmContact,
} from './types';

export type CrmContactClock = {
  now(): string;
};

export type CrmContactIds = {
  contactId(): string;
};

export type CreateCrmContactInput = {
  actor: CrmActorContext;
  email?: string | null;
  fullName: string;
  phone?: string | null;
  source?: string | null;
  tenantId: string;
};

export type LinkCrmContactToAccountInput = {
  accountId: string;
  actor: CrmActorContext;
  contactId: string;
  isPrimary?: boolean;
  relationshipId: string;
  role: string;
};

export type CrmContactMutationResult =
  | { success: true; contact: CrmContact; event: CrmContactCreatedEvent }
  | { success: true; accountContact: CrmAccountContact }
  | { success: false; error: 'not_found' }
  | {
      success: false;
      error: 'forbidden';
      reason:
        | 'agent_scope'
        | 'archived_destination'
        | 'branch_scope'
        | 'role_scope'
        | 'tenant_scope';
    }
  | { success: false; error: 'invalid_input'; reason: 'invalid_name' | 'invalid_role' };

function isAccountContactRole(value: string): value is CrmAccountContactRole {
  return CRM_ACCOUNT_CONTACT_ROLES.includes(value as CrmAccountContactRole);
}

function authorizeAgent(
  actor: CrmActorContext,
  tenantId: string
): Exclude<CrmContactMutationResult, { success: true }> | null {
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

export async function createCrmContact(
  input: CreateCrmContactInput,
  repository: Pick<CrmContactRepository, 'createContact'>,
  services: { clock: CrmContactClock; ids: CrmContactIds }
): Promise<CrmContactMutationResult> {
  const fullName = input.fullName.trim();
  if (!fullName) return { success: false, error: 'invalid_input', reason: 'invalid_name' };

  const denied = authorizeAgent(input.actor, input.tenantId);
  if (denied) return denied;

  const branchId = input.actor.scope.branchId!;
  const now = services.clock.now();
  const contact: CrmContact = {
    archivedAt: null,
    archivedById: null,
    branchId,
    createdAt: now,
    email: input.email?.trim() || undefined,
    fullName,
    id: services.ids.contactId(),
    phone: input.phone?.trim() || undefined,
    source: input.source?.trim() || undefined,
    tenantId: input.tenantId,
    updatedAt: now,
  };
  const created = await repository.createContact({ contact });

  return {
    contact: created,
    event: {
      actor: {
        actorId: input.actor.actorId,
        branchId,
        role: input.actor.role,
        tenantId: input.actor.tenantId,
      },
      aggregateId: created.id,
      aggregateType: 'contact',
      occurredAt: now,
      payload: {
        branchId: created.branchId,
        contactId: created.id,
        email: created.email ?? null,
        fullName: created.fullName,
      },
      tenantId: created.tenantId,
      type: 'crm.contact.created',
    },
    success: true,
  };
}

export async function linkCrmContactToAccount(
  input: LinkCrmContactToAccountInput,
  repository: Pick<
    CrmContactRepository,
    'findAccountById' | 'findContactById' | 'linkContactToAccount'
  >,
  services: { clock: CrmContactClock }
): Promise<CrmContactMutationResult> {
  if (!isAccountContactRole(input.role)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_role' };
  }

  const denied = authorizeAgent(input.actor, input.actor.tenantId);
  if (denied) return denied;

  const [account, contact] = await Promise.all([
    repository.findAccountById({ accountId: input.accountId, tenantId: input.actor.tenantId }),
    repository.findContactById({ contactId: input.contactId, tenantId: input.actor.tenantId }),
  ]);
  if (!account || !contact) return { success: false, error: 'not_found' };
  if (account.tenantId !== input.actor.tenantId || contact.tenantId !== input.actor.tenantId) {
    return { success: false, error: 'forbidden', reason: 'tenant_scope' };
  }
  if (account.archivedAt || contact.archivedAt) {
    return { success: false, error: 'forbidden', reason: 'archived_destination' };
  }
  const actorBranchId = input.actor.scope.branchId!;
  if (account.branchId !== actorBranchId || contact.branchId !== actorBranchId) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }

  const accountContact = await repository.linkContactToAccount({
    accountContact: {
      accountId: account.id,
      contactId: contact.id,
      createdAt: services.clock.now(),
      id: input.relationshipId,
      isPrimary: input.isPrimary ?? false,
      role: input.role,
      tenantId: input.actor.tenantId,
    },
  });
  return { accountContact, success: true };
}
