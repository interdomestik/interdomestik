import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmDealWonEvent, CrmDomainEvent } from '../outbox/types';
import type { CrmPipeline } from '../pipelines/repository';
import type {
  CrmDeal,
  CrmDealRepository,
  CrmDealStageHistory,
  CrmDealReferenceSnapshot,
} from './repository';
import { CrmDealRepositoryFailure } from './repository';
import { staticLossReasonResolver } from './loss-reason';
import {
  archiveCrmDeal,
  createCrmDeal,
  loseCrmDeal,
  moveCrmDealStage,
  reopenCrmDeal,
  winCrmDeal,
} from './mutations';
import { deriveDealNextAction } from './next-action';

const now = '2026-05-13T20:10:00.000Z';

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const managerActor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

function pipeline(overrides: Partial<CrmPipeline> = {}): CrmPipeline {
  return {
    archivedAt: null,
    archivedById: null,
    branchId: 'branch-1',
    createdAt: now,
    id: 'pipeline-1',
    name: 'Residential Sales',
    stages: [
      {
        expectedDurationDays: 7,
        id: 'stage-qualified',
        isLost: false,
        isWon: false,
        name: 'Qualified',
        order: 10,
        pipelineId: 'pipeline-1',
        probability: 20,
        tenantId: 'tenant-1',
      },
      {
        expectedDurationDays: 14,
        id: 'stage-commit',
        isLost: false,
        isWon: false,
        name: 'Commit',
        order: 20,
        pipelineId: 'pipeline-1',
        probability: 80,
        tenantId: 'tenant-1',
      },
      {
        id: 'stage-won',
        isLost: false,
        isWon: true,
        name: 'Won',
        order: 30,
        pipelineId: 'pipeline-1',
        probability: 100,
        tenantId: 'tenant-1',
      },
      {
        id: 'stage-lost',
        isLost: true,
        isWon: false,
        name: 'Lost',
        order: 40,
        pipelineId: 'pipeline-1',
        probability: 0,
        tenantId: 'tenant-1',
      },
    ],
    tenantId: 'tenant-1',
    updatedAt: now,
    ...overrides,
  };
}

function deal(overrides: Partial<CrmDeal> = {}): CrmDeal {
  return {
    accountId: 'account-1',
    agentId: 'agent-1',
    archivedAt: null,
    archivedById: null,
    branchId: 'branch-1',
    contactId: 'contact-1',
    createdAt: now,
    currencyCode: 'EUR',
    currentStageId: 'stage-qualified',
    expectedCloseAt: '2026-06-01T00:00:00.000Z',
    forecastCategory: 'pipeline',
    id: 'deal-1',
    pipelineId: 'pipeline-1',
    tenantId: 'tenant-1',
    updatedAt: now,
    valueAmountMinor: 500000,
    ...overrides,
  };
}

class InMemoryCrmDeals implements CrmDealRepository {
  readonly deals: CrmDeal[] = [];
  readonly histories: CrmDealStageHistory[] = [];
  currentPipeline = pipeline();
  referenceSnapshot: CrmDealReferenceSnapshot = {
    account: { branchId: 'branch-1', id: 'account-1', tenantId: 'tenant-1' },
    contact: { branchId: 'branch-1', id: 'contact-1', tenantId: 'tenant-1' },
  };

  async createDealWithStageHistory(params: {
    deal: CrmDeal;
    history: CrmDealStageHistory;
  }): Promise<{ deal: CrmDeal; history: CrmDealStageHistory }> {
    this.deals.push(params.deal);
    this.histories.push(params.history);
    return params;
  }

  async findDealById(params: { dealId: string; tenantId: string }): Promise<CrmDeal | null> {
    return (
      this.deals.find(deal => deal.id === params.dealId && deal.tenantId === params.tenantId) ??
      null
    );
  }

  async findPipelineById(): Promise<CrmPipeline | null> {
    return this.currentPipeline;
  }

  async findReferenceSnapshot(): Promise<CrmDealReferenceSnapshot> {
    return this.referenceSnapshot;
  }

  async updateDeal(params: { deal: CrmDeal }): Promise<CrmDeal> {
    const index = this.deals.findIndex(deal => deal.id === params.deal.id);
    if (index >= 0) this.deals[index] = params.deal;
    return params.deal;
  }

  async updateDealWithStageHistory(params: {
    deal: CrmDeal;
    history: CrmDealStageHistory;
  }): Promise<{ deal: CrmDeal; history: CrmDealStageHistory }> {
    const deal = await this.updateDeal({ deal: params.deal });
    this.histories.push(params.history);
    return { deal, history: params.history };
  }
}

describe('CRM deals domain', () => {
  it('creates a scoped deal and emits the typed created event', async () => {
    const repository = new InMemoryCrmDeals();
    const ids = {
      dealId: vi.fn(() => 'deal-1'),
      dealStageHistoryId: vi.fn(() => 'history-1'),
    };

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          currencyCode: 'EUR',
          expectedCloseAt: '2026-06-01T00:00:00.000Z',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        repository,
        { clock: { now: () => now }, ids }
      )
    ).resolves.toEqual({
      deal: expect.objectContaining({
        accountId: 'account-1',
        currentStageId: 'stage-qualified',
        currencyCode: 'EUR',
        forecastCategory: 'pipeline',
        id: 'deal-1',
        valueAmountMinor: 500000,
      }),
      event: expect.objectContaining({
        aggregateId: 'deal-1',
        aggregateType: 'deal',
        type: 'crm.deal.created',
      }),
      history: expect.objectContaining({
        dealId: 'deal-1',
        fromStageId: null,
        id: 'history-1',
        toStageId: 'stage-qualified',
      }),
      success: true,
    });
    expect(repository.deals).toHaveLength(1);
    expect(repository.histories).toEqual([
      expect.objectContaining({
        dealId: 'deal-1',
        fromStageId: null,
        id: 'history-1',
        toStageId: 'stage-qualified',
      }),
    ]);
  });

  it('rejects invalid stage, references, forecast category, currency, and amount inputs', async () => {
    const invalidInputs = [
      { pipelineStageId: 'missing-stage' },
      { forecastCategory: 'closed' },
      { currencyCode: 'eur' },
      { valueAmountMinor: -1 },
    ];

    for (const overrides of invalidInputs) {
      const repository = new InMemoryCrmDeals();
      const result = await createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          currencyCode: 'EUR',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
          ...overrides,
        },
        repository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      );

      expect(result.success).toBe(false);
      expect(repository.deals).toHaveLength(0);
    }

    const repository = new InMemoryCrmDeals();
    repository.referenceSnapshot = {
      account: { branchId: 'branch-2', id: 'account-1', tenantId: 'tenant-1' },
      contact: null,
    };

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          currencyCode: 'EUR',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        repository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });

    const archivedPipelineRepository = new InMemoryCrmDeals();
    archivedPipelineRepository.currentPipeline = pipeline({ archivedAt: now });

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          currencyCode: 'EUR',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        archivedPipelineRepository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'archived_pipeline' });

    const archivedReferenceRepository = new InMemoryCrmDeals();
    archivedReferenceRepository.referenceSnapshot = {
      account: { archivedAt: now, branchId: 'branch-1', id: 'account-1', tenantId: 'tenant-1' },
      contact: { branchId: 'branch-1', id: 'contact-1', tenantId: 'tenant-1' },
    };

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          currencyCode: 'EUR',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        archivedReferenceRepository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'archived_reference' });

    const lostStageRepository = new InMemoryCrmDeals();
    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          currencyCode: 'EUR',
          forecastCategory: 'closed',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-lost',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        lostStageRepository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'loss_reason_required' });
  });

  it('normalizes optional contact IDs and requires staff creators to assign an agent', async () => {
    const repository = new InMemoryCrmDeals();

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: managerActor,
          currencyCode: 'EUR',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        repository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-manager', dealStageHistoryId: () => 'history-manager' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'agent_required' });

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: '   ',
          currencyCode: 'EUR',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        repository,
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      )
    ).resolves.toEqual({
      deal: expect.objectContaining({ contactId: null }),
      event: expect.objectContaining({
        payload: expect.objectContaining({ contactId: null }),
      }),
      history: expect.objectContaining({ id: 'history-1' }),
      success: true,
    });
  });

  it('moves stages with append-only history and mutually exclusive transition events', async () => {
    const repository = new InMemoryCrmDeals();
    repository.deals.push(deal());
    const lossReasons = staticLossReasonResolver([
      { code: 'price', id: 'loss-price', tenantId: 'tenant-1' },
    ]);

    const lost = await moveCrmDealStage(
      {
        actor: agentActor,
        dealId: 'deal-1',
        fromStageId: 'stage-qualified',
        lossReasonId: 'loss-price',
        toStageId: 'stage-lost',
      },
      repository,
      lossReasons,
      {
        clock: { now: () => now },
        ids: { dealStageHistoryId: () => 'history-lost' },
      }
    );

    expect(lost).toEqual({
      deal: expect.objectContaining({
        currentStageId: 'stage-lost',
        forecastCategory: 'closed',
        lossReasonId: 'loss-price',
      }),
      event: expect.objectContaining({ type: 'crm.deal.lost' }),
      history: expect.objectContaining({
        fromStageId: 'stage-qualified',
        id: 'history-lost',
        lossReasonId: 'loss-price',
        toStageId: 'stage-lost',
      }),
      success: true,
    });
    expect(repository.histories).toHaveLength(1);

    const archivedRepository = new InMemoryCrmDeals();
    archivedRepository.deals.push(deal({ archivedAt: now }));
    await expect(
      moveCrmDealStage(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          toStageId: 'stage-commit',
        },
        archivedRepository,
        lossReasons,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-archived' } }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'archived_deal' });

    const noOpRepository = new InMemoryCrmDeals();
    noOpRepository.deals.push(deal());
    await expect(
      moveCrmDealStage(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          toStageId: 'stage-qualified',
        },
        noOpRepository,
        lossReasons,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-noop' } }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'no_op_transition' });
    expect(noOpRepository.histories).toHaveLength(0);

    const second = await moveCrmDealStage(
      {
        actor: agentActor,
        dealId: 'deal-1',
        fromStageId: 'stage-qualified',
        toStageId: 'stage-commit',
      },
      repository,
      lossReasons,
      {
        clock: { now: () => now },
        ids: { dealStageHistoryId: () => 'history-2' },
      }
    );
    expect(second).toEqual({ success: false, error: 'invalid_input', reason: 'stage_drift' });
  });

  it('enforces loss-reason and won-stage rules', async () => {
    const repository = new InMemoryCrmDeals();
    repository.deals.push(deal());
    const lossReasons = staticLossReasonResolver([
      { code: 'price', id: 'loss-price', tenantId: 'tenant-1' },
    ]);

    await expect(
      moveCrmDealStage(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          toStageId: 'stage-lost',
        },
        repository,
        lossReasons,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-1' } }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'loss_reason_required' });

    await expect(
      moveCrmDealStage(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          lossReasonId: 'loss-price',
          toStageId: 'stage-won',
        },
        repository,
        lossReasons,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-1' } }
      )
    ).resolves.toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'loss_reason_not_allowed',
    });
  });

  it('restricts reopen to branch managers and excludes closed deals from next action', async () => {
    const repository = new InMemoryCrmDeals();
    repository.deals.push(
      deal({
        closedAt: now,
        currentStageId: 'stage-lost',
        forecastCategory: 'closed',
        lossReasonId: 'loss-price',
      })
    );

    expect(deriveDealNextAction(repository.deals[0]!)).toEqual({ type: 'none' });

    await expect(
      reopenCrmDeal(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-lost',
          reopenReason: 'New budget cycle',
          toStageId: 'stage-commit',
        },
        repository,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-reopen' } }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'role_scope' });

    await expect(
      reopenCrmDeal(
        {
          actor: managerActor,
          dealId: 'deal-1',
          fromStageId: 'stage-lost',
          reopenReason: 'New budget cycle',
          toStageId: 'stage-commit',
        },
        repository,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-reopen' } }
      )
    ).resolves.toEqual({
      deal: expect.objectContaining({
        closedAt: null,
        currentStageId: 'stage-commit',
        forecastCategory: 'pipeline',
        lossReasonId: null,
      }),
      event: expect.objectContaining({ type: 'crm.deal.reopened' }),
      history: expect.objectContaining({
        fromStageId: 'stage-lost',
        id: 'history-reopen',
        reason: 'New budget cycle',
        toStageId: 'stage-commit',
      }),
      success: true,
    });

    const openRepository = new InMemoryCrmDeals();
    openRepository.deals.push(deal());
    await expect(
      reopenCrmDeal(
        {
          actor: managerActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          reopenReason: 'No closed state',
          toStageId: 'stage-commit',
        },
        openRepository,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-open' } }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'deal_not_closed' });

    const archivedRepository = new InMemoryCrmDeals();
    archivedRepository.deals.push(
      deal({
        archivedAt: now,
        closedAt: now,
        currentStageId: 'stage-lost',
        forecastCategory: 'closed',
      })
    );
    await expect(
      reopenCrmDeal(
        {
          actor: managerActor,
          dealId: 'deal-1',
          fromStageId: 'stage-lost',
          reopenReason: 'Archived cannot reopen',
          toStageId: 'stage-commit',
        },
        archivedRepository,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-archived' } }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'archived_deal' });
  });

  it('wins and loses deals through explicit transition commands', async () => {
    const wonRepository = new InMemoryCrmDeals();
    wonRepository.deals.push(deal());
    const lossReasons = staticLossReasonResolver([
      { code: 'price', id: 'loss-price', tenantId: 'tenant-1' },
    ]);

    await expect(
      winCrmDeal(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          toStageId: 'stage-won',
        },
        wonRepository,
        lossReasons,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-won' } }
      )
    ).resolves.toEqual({
      deal: expect.objectContaining({
        closedAt: now,
        currentStageId: 'stage-won',
        forecastCategory: 'closed',
        lossReasonId: null,
      }),
      event: expect.objectContaining({ type: 'crm.deal.won' }),
      history: expect.objectContaining({
        fromStageId: 'stage-qualified',
        id: 'history-won',
        toStageId: 'stage-won',
      }),
      success: true,
    });

    const lostRepository = new InMemoryCrmDeals();
    lostRepository.deals.push(deal());

    await expect(
      loseCrmDeal(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          lossReasonId: 'loss-price',
          toStageId: 'stage-lost',
        },
        lostRepository,
        lossReasons,
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-lost' } }
      )
    ).resolves.toEqual({
      deal: expect.objectContaining({
        closedAt: now,
        currentStageId: 'stage-lost',
        forecastCategory: 'closed',
        lossReasonId: 'loss-price',
      }),
      event: expect.objectContaining({ type: 'crm.deal.lost' }),
      history: expect.objectContaining({
        fromStageId: 'stage-qualified',
        id: 'history-lost',
        lossReasonId: 'loss-price',
        toStageId: 'stage-lost',
      }),
      success: true,
    });
  });

  it('archives scoped deals without adding stage history', async () => {
    const repository = new InMemoryCrmDeals();
    repository.deals.push(deal());

    await expect(
      archiveCrmDeal(
        {
          actor: managerActor,
          dealId: 'deal-1',
        },
        repository,
        { clock: { now: () => '2026-05-13T20:11:00.000Z' } }
      )
    ).resolves.toEqual({
      deal: expect.objectContaining({
        archivedAt: '2026-05-13T20:11:00.000Z',
        archivedById: 'manager-1',
        currentStageId: 'stage-qualified',
        updatedAt: '2026-05-13T20:11:00.000Z',
      }),
      success: true,
    });
    expect(repository.histories).toHaveLength(0);
  });

  it('maps repository currency mirror refusal to typed invalid currency', async () => {
    class RejectingCreateRepository extends InMemoryCrmDeals {
      override async createDealWithStageHistory(): Promise<{
        deal: CrmDeal;
        history: CrmDealStageHistory;
      }> {
        throw new CrmDealRepositoryFailure('invalid_currency');
      }
    }

    await expect(
      createCrmDeal(
        {
          accountId: 'account-1',
          actor: agentActor,
          contactId: 'contact-1',
          currencyCode: 'USD',
          forecastCategory: 'pipeline',
          pipelineId: 'pipeline-1',
          pipelineStageId: 'stage-qualified',
          tenantId: 'tenant-1',
          valueAmountMinor: 500000,
        },
        new RejectingCreateRepository(),
        {
          clock: { now: () => now },
          ids: { dealId: () => 'deal-1', dealStageHistoryId: () => 'history-1' },
        }
      )
    ).resolves.toEqual({
      error: 'invalid_input',
      reason: 'invalid_currency',
      success: false,
    });
  });

  it('maps late repository stage drift to the typed stage_drift result', async () => {
    class ConcurrentStageMoveRepository extends InMemoryCrmDeals {
      override async updateDealWithStageHistory(): Promise<{
        deal: CrmDeal;
        history: CrmDealStageHistory;
      }> {
        throw new CrmDealRepositoryFailure('stage_drift');
      }
    }

    const repository = new ConcurrentStageMoveRepository();
    repository.deals.push(deal());

    await expect(
      moveCrmDealStage(
        {
          actor: agentActor,
          dealId: 'deal-1',
          fromStageId: 'stage-qualified',
          toStageId: 'stage-commit',
        },
        repository,
        staticLossReasonResolver([]),
        { clock: { now: () => now }, ids: { dealStageHistoryId: () => 'history-1' } }
      )
    ).resolves.toEqual({
      error: 'invalid_input',
      reason: 'stage_drift',
      success: false,
    });
  });

  it('keeps existing crm.deal.won events assignable while accepting new deal events', () => {
    const wonEvent: CrmDealWonEvent = {
      actor: null,
      aggregateId: 'deal-1',
      aggregateType: 'deal',
      occurredAt: now,
      payload: {
        accountId: 'account-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        dealId: 'deal-1',
        expectedCommissionCents: 1000,
        valueCents: 500000,
      },
      tenantId: 'tenant-1',
      type: 'crm.deal.won',
    };

    expectTypeOf(wonEvent).toMatchTypeOf<CrmDomainEvent>();
    expectTypeOf<'crm.deal.created'>().toMatchTypeOf<CrmDomainEvent['type']>();
    expectTypeOf<'crm.deal.stage_changed'>().toMatchTypeOf<CrmDomainEvent['type']>();
    expectTypeOf<'crm.deal.lost'>().toMatchTypeOf<CrmDomainEvent['type']>();
    expectTypeOf<'crm.deal.reopened'>().toMatchTypeOf<CrmDomainEvent['type']>();
  });
});
