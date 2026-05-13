import type { CrmActorContext } from '../context';
import {
  enqueueCrmDomainEvents,
  type CrmOutboxClock,
  type CrmOutboxIds,
} from '../outbox/mutations';
import type { CrmOutboxAppendResult, CrmOutboxPort } from '../outbox/repository';
import type { CrmLeadConvertedEvent } from '../outbox/types';
import type { CrmLeadConversionRepository } from './repository';
import type { CrmLeadConversion } from './types';

export type CrmLeadConversionClock = {
  now(): string;
};

export type CrmLeadConversionIds = {
  leadConversionHistoryId(): string;
};

export type ConvertCrmLeadInput = {
  accountId: string;
  actor: CrmActorContext;
  contactId: string;
  leadId: string;
  reason?: string | null;
};

export type ConvertCrmLeadResult =
  | {
      success: true;
      status: 'converted' | 'already_converted';
      conversion: CrmLeadConversion;
      events: readonly CrmLeadConvertedEvent[];
    }
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
  | { success: false; error: 'invalid_input'; reason: 'already_closed' | 'invalid_target' };

function authorizeLeadConversionActor(
  actor: CrmActorContext
): Exclude<ConvertCrmLeadResult, { success: true }> | null {
  if (actor.role !== 'agent') return { success: false, error: 'forbidden', reason: 'role_scope' };
  if (actor.scope.agentId && actor.scope.agentId !== actor.actorId) {
    return { success: false, error: 'forbidden', reason: 'agent_scope' };
  }
  if (!actor.scope.branchId) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }
  return null;
}

function eventForConversion(
  conversion: CrmLeadConversion,
  actor: CrmActorContext
): CrmLeadConvertedEvent {
  return {
    actor: {
      actorId: actor.actorId,
      branchId: conversion.branchId,
      role: actor.role,
      tenantId: actor.tenantId,
    },
    aggregateId: conversion.leadId,
    aggregateType: 'lead',
    occurredAt: conversion.convertedAt,
    payload: {
      accountId: conversion.accountId,
      branchId: conversion.branchId,
      contactId: conversion.contactId,
      conversionId: conversion.id,
      leadId: conversion.leadId,
      reason: conversion.reason ?? null,
    },
    tenantId: conversion.tenantId,
    type: 'crm.lead.converted',
  };
}

export async function convertCrmLead(
  input: ConvertCrmLeadInput,
  repository: CrmLeadConversionRepository,
  services: { clock: CrmLeadConversionClock; ids: CrmLeadConversionIds }
): Promise<ConvertCrmLeadResult> {
  const accountId = input.accountId.trim();
  const contactId = input.contactId.trim();
  const leadId = input.leadId.trim();
  if (!accountId || !contactId || !leadId) {
    return { success: false, error: 'invalid_input', reason: 'invalid_target' };
  }

  const actorDenied = authorizeLeadConversionActor(input.actor);
  if (actorDenied) return actorDenied;

  const lead = await repository.findLeadById({ leadId, tenantId: input.actor.tenantId });
  if (!lead) return { success: false, error: 'not_found' };
  if (lead.tenantId !== input.actor.tenantId) {
    return { success: false, error: 'forbidden', reason: 'tenant_scope' };
  }
  if (lead.agentId !== input.actor.actorId) {
    return { success: false, error: 'forbidden', reason: 'agent_scope' };
  }
  if (!lead.branchId || lead.branchId !== input.actor.scope.branchId) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }
  if (lead.stage === 'won' || lead.stage === 'lost' || lead.wonAt || lead.lostAt) {
    return { success: false, error: 'invalid_input', reason: 'already_closed' };
  }

  const existing = await repository.findConversionByLeadId({
    leadId,
    tenantId: input.actor.tenantId,
  });
  if (existing) {
    return {
      conversion: existing,
      events: [eventForConversion(existing, input.actor)],
      status: 'already_converted',
      success: true,
    };
  }

  const destination = await repository.findConversionDestination({
    accountId,
    contactId,
    tenantId: input.actor.tenantId,
  });
  if (!destination.account || !destination.contact) {
    return { success: false, error: 'not_found' };
  }
  if (
    destination.account.tenantId !== input.actor.tenantId ||
    destination.contact.tenantId !== input.actor.tenantId
  ) {
    return { success: false, error: 'forbidden', reason: 'tenant_scope' };
  }
  if (destination.account.archivedAt || destination.contact.archivedAt) {
    return { success: false, error: 'forbidden', reason: 'archived_destination' };
  }
  if (
    destination.account.branchId !== input.actor.scope.branchId ||
    destination.contact.branchId !== input.actor.scope.branchId
  ) {
    return { success: false, error: 'forbidden', reason: 'branch_scope' };
  }

  const conversion: CrmLeadConversion = {
    accountId,
    actorId: input.actor.actorId,
    branchId: lead.branchId,
    contactId,
    convertedAt: services.clock.now(),
    id: services.ids.leadConversionHistoryId(),
    leadId,
    reason: input.reason?.trim() || null,
    tenantId: input.actor.tenantId,
  };
  const appended = await repository.appendLeadConversion({ conversion });

  return {
    conversion: appended,
    events: [eventForConversion(appended, input.actor)],
    status: 'converted',
    success: true,
  };
}

export async function enqueueCrmLeadConversionEvents(
  result: ConvertCrmLeadResult,
  outbox: Pick<CrmOutboxPort, 'appendEvents'>,
  services: { clock: CrmOutboxClock; ids: CrmOutboxIds }
): Promise<
  | { success: true; results: readonly CrmOutboxAppendResult[] }
  | Exclude<ConvertCrmLeadResult, { success: true }>
  | { success: false; error: 'invalid_input'; reason: string }
> {
  if (!result.success) return result;
  return enqueueCrmDomainEvents(
    {
      events: result.events.map(event => ({
        event,
        idempotencyKey: `lead-conversion:${event.tenantId}:${event.payload.leadId}`,
      })),
    },
    outbox,
    services
  );
}
