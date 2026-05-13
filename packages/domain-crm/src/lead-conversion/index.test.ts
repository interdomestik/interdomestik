import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmLead } from '../leads/types';
import type { CrmOutboxAppendResult, CrmOutboxPort } from '../outbox/repository';
import type { CreateCrmOutboxEventData, CrmOutboxEvent } from '../outbox/types';
import type {
  CrmLeadConversion,
  CrmLeadConversionDestination,
  CrmLeadConversionRepository,
} from './repository';
import { convertCrmLead, enqueueCrmLeadConversionEvents } from './mutations';

const now = '2026-05-13T18:30:00.000Z';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function lead(overrides: Partial<CrmLead> = {}): CrmLead {
  return {
    agentId: 'agent-1',
    branchId: 'branch-1',
    companyName: 'Crystal Home LLC',
    createdAt: now,
    email: 'lead@example.com',
    fullName: 'Lead One',
    id: 'lead-1',
    stage: 'qualified',
    tenantId: 'tenant-1',
    type: 'business',
    updatedAt: now,
    ...overrides,
  };
}

function destination(
  overrides: Partial<CrmLeadConversionDestination> = {}
): CrmLeadConversionDestination {
  const account = {
    archivedAt: null,
    branchId: 'branch-1',
    id: 'account-1',
    tenantId: 'tenant-1',
  };
  const contact = {
    archivedAt: null,
    branchId: 'branch-1',
    id: 'contact-1',
    tenantId: 'tenant-1',
  };
  return {
    account,
    contact,
    ...overrides,
  };
}

class InMemoryCrmLeadConversions implements CrmLeadConversionRepository {
  readonly conversions: CrmLeadConversion[] = [];
  currentDestination = destination();
  currentLead: CrmLead | null = lead();

  async appendLeadConversion(params: {
    conversion: CrmLeadConversion;
  }): Promise<CrmLeadConversion> {
    this.conversions.push(params.conversion);
    return params.conversion;
  }

  async findConversionByLeadId(): Promise<CrmLeadConversion | null> {
    return this.conversions[0] ?? null;
  }

  async findConversionDestination(): Promise<CrmLeadConversionDestination> {
    return this.currentDestination;
  }

  async findLeadById(): Promise<CrmLead | null> {
    return this.currentLead;
  }
}

class InMemoryCrmOutbox implements CrmOutboxPort {
  readonly events: CrmOutboxEvent[] = [];

  async appendEvent(params: { event: CreateCrmOutboxEventData }): Promise<CrmOutboxAppendResult> {
    const event = this.toStoredEvent(params.event);
    this.events.push(event);
    return { status: 'enqueued', outboxEvent: event };
  }

  async appendEvents(params: {
    events: readonly CreateCrmOutboxEventData[];
  }): Promise<readonly CrmOutboxAppendResult[]> {
    return Promise.all(params.events.map(event => this.appendEvent({ event })));
  }

  async claimPendingEvents(): Promise<readonly CrmOutboxEvent[]> {
    return this.events;
  }

  async markEventFailed(): Promise<CrmOutboxEvent | null> {
    return null;
  }

  async markEventPublished(): Promise<CrmOutboxEvent | null> {
    return null;
  }

  private toStoredEvent(event: CreateCrmOutboxEventData): CrmOutboxEvent {
    return {
      aggregateId: event.event.aggregateId,
      aggregateType: event.event.aggregateType,
      availableAt: event.availableAt,
      createdAt: now,
      event: event.event,
      id: event.id,
      idempotencyKey: event.idempotencyKey,
      retryCount: 0,
      status: 'pending',
      tenantId: event.event.tenantId,
      type: event.event.type,
    };
  }
}

describe('CRM lead conversion domain', () => {
  it('converts an eligible lead into same-tenant account and contact references with append-only history', async () => {
    const repository = new InMemoryCrmLeadConversions();
    const ids = {
      leadConversionHistoryId: vi.fn(() => 'conversion-1'),
      outboxEventId: vi.fn(() => 'outbox-1'),
    };

    const result = await convertCrmLead(
      {
        accountId: 'account-1',
        actor: agentActor,
        contactId: 'contact-1',
        leadId: 'lead-1',
        reason: 'qualified',
      },
      repository,
      { clock: { now: () => now }, ids }
    );

    expect(result).toEqual({
      conversion: {
        accountId: 'account-1',
        actorId: 'agent-1',
        branchId: 'branch-1',
        contactId: 'contact-1',
        convertedAt: now,
        id: 'conversion-1',
        leadId: 'lead-1',
        reason: 'qualified',
        tenantId: 'tenant-1',
      },
      events: [
        expect.objectContaining({
          aggregateId: 'lead-1',
          aggregateType: 'lead',
          type: 'crm.lead.converted',
        }),
      ],
      status: 'converted',
      success: true,
    });
    expect(repository.conversions).toHaveLength(1);

    const outbox = new InMemoryCrmOutbox();
    await expect(
      enqueueCrmLeadConversionEvents(result, outbox, {
        clock: { now: () => now },
        ids,
      })
    ).resolves.toMatchObject({ success: true });
    expect(outbox.events).toHaveLength(1);
    expect(outbox.events[0]?.idempotencyKey).toBe('lead-conversion:tenant-1:lead-1');
  });

  it('returns the existing conversion without appending duplicate history', async () => {
    const repository = new InMemoryCrmLeadConversions();
    repository.conversions.push({
      accountId: 'account-1',
      actorId: 'agent-1',
      branchId: 'branch-1',
      contactId: 'contact-1',
      convertedAt: now,
      id: 'conversion-1',
      leadId: 'lead-1',
      reason: 'qualified',
      tenantId: 'tenant-1',
    });

    await expect(
      convertCrmLead(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          leadId: 'lead-1',
        },
        repository,
        {
          clock: { now: () => now },
          ids: { leadConversionHistoryId: () => 'conversion-2' },
        }
      )
    ).resolves.toMatchObject({ status: 'already_converted', success: true });
    expect(repository.conversions).toHaveLength(1);
  });

  it('suppresses conversion for cross-tenant, missing branch, archived destination, and ineligible lead states', async () => {
    const cases: Array<{
      destination?: CrmLeadConversionDestination;
      lead?: CrmLead | null;
      actor?: CrmActorContext;
    }> = [
      {
        destination: destination({
          account: {
            archivedAt: null,
            branchId: 'branch-1',
            id: 'account-1',
            tenantId: 'tenant-2',
          },
        }),
      },
      { actor: { ...agentActor, scope: { agentId: 'agent-1' } } },
      {
        destination: destination({
          contact: {
            archivedAt: '2026-05-13T18:31:00.000Z',
            branchId: 'branch-1',
            id: 'contact-1',
            tenantId: 'tenant-1',
          },
        }),
      },
      { lead: lead({ stage: 'lost' }) },
    ];

    for (const currentCase of cases) {
      const repository = new InMemoryCrmLeadConversions();
      repository.currentLead = currentCase.lead ?? lead();
      repository.currentDestination = currentCase.destination ?? destination();

      const result = await convertCrmLead(
        {
          accountId: 'account-1',
          actor: currentCase.actor ?? agentActor,
          contactId: 'contact-1',
          leadId: 'lead-1',
        },
        repository,
        {
          clock: { now: () => now },
          ids: { leadConversionHistoryId: () => 'conversion-1' },
        }
      );

      expect(result.success).toBe(false);
      expect(repository.conversions).toHaveLength(0);
    }
  });
});
