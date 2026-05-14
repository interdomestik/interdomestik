import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

import { CrmDealRepositoryFailure } from '@interdomestik/domain-crm/deals/repository';
import type { CrmDeal, CrmDealStageHistory } from '@interdomestik/domain-crm/deals/repository';

import { crmDeals, crmDealStageHistory } from '@interdomestik/database/schema';

import { createCrmDealRepository } from './deal-repository';

const now = '2026-05-14T08:00:00.000Z';

const stageWon = {
  archivedAt: null,
  archivedById: null,
  createdAt: new Date(now),
  expectedDurationDays: null,
  id: 'stage-won',
  isLost: false,
  isWon: true,
  name: 'Won',
  order: 30,
  pipelineId: 'pipeline-1',
  probability: 100,
  tenantId: 'tenant-1',
  updatedAt: new Date(now),
};

const stageCommit = {
  ...stageWon,
  id: 'stage-commit',
  isWon: false,
  name: 'Commit',
  order: 20,
  probability: 80,
};

const deal: CrmDeal = {
  accountId: 'account-1',
  agentId: 'agent-1',
  archivedAt: null,
  archivedById: null,
  branchId: 'branch-1',
  closedAt: now,
  contactId: 'contact-1',
  createdAt: now,
  currencyCode: 'EUR',
  currentStageId: 'stage-won',
  expectedCloseAt: '2026-06-01T00:00:00.000Z',
  forecastCategory: 'closed',
  id: 'deal-1',
  lossReasonId: null,
  pipelineId: 'pipeline-1',
  tenantId: 'tenant-1',
  updatedAt: now,
  valueAmountMinor: 500000,
};

const history: CrmDealStageHistory = {
  actorId: 'agent-1',
  createdAt: now,
  dealId: 'deal-1',
  fromStageId: 'stage-commit',
  id: 'history-1',
  lossReasonId: null,
  reason: null,
  tenantId: 'tenant-1',
  toStageId: 'stage-won',
};

function fakeReturning<Row>(row: Row, calls: unknown[]) {
  return {
    values(values: unknown) {
      calls.push({ action: 'insert', values });
      return { returning: vi.fn(async () => [row]) };
    },
  };
}

function createFakeDb(options: { updateRows?: readonly unknown[] } = {}) {
  const calls: unknown[] = [];
  const tx = {
    insert(table: unknown) {
      if (table === crmDeals) {
        return {
          values(values: unknown) {
            calls.push({ action: 'insertDeal', values });
            return { returning: vi.fn(async () => [values]) };
          },
        };
      }
      if (table === crmDealStageHistory) {
        return fakeReturning(null, calls);
      }
      return fakeReturning(null, calls);
    },
    update() {
      return {
        set(values: unknown) {
          calls.push({ action: 'updateDeal', values });
          return {
            where(where: unknown) {
              calls.push({ action: 'updateWhere', where });
              return { returning: vi.fn(async () => options.updateRows ?? [deal]) };
            },
          };
        },
      };
    },
  };

  return {
    calls,
    db: {
      query: {
        crmDeals: {
          findFirst: vi.fn(),
        },
        crmPipelineStages: {
          findFirst: vi.fn(async () => stageWon),
        },
        crmPipelines: {
          findFirst: vi.fn(),
        },
      },
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
      update: tx.update,
    },
  };
}

describe('crmDealRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates normalized deals and appends created history in one transaction with legacy mirrors', async () => {
    const fake = createFakeDb();
    const repository = createCrmDealRepository(fake.db as never);

    await expect(
      repository.createDealWithStageHistory({
        deal,
        history: { ...history, fromStageId: null },
      })
    ).resolves.toEqual({
      deal: expect.objectContaining({
        currentStageId: 'stage-won',
        forecastCategory: 'closed',
        id: 'deal-1',
      }),
      history: expect.objectContaining({ id: 'history-1' }),
    });

    expect(fake.db.transaction).toHaveBeenCalledOnce();
    expect(fake.calls).toEqual([
      expect.objectContaining({
        action: 'insertDeal',
        values: expect.objectContaining({
          closedAt: new Date(now),
          currentStageId: 'stage-won',
          leadId: null,
          stage: 'closed_won',
          status: 'won',
          tenantId: 'tenant-1',
          valueCents: 500000,
        }),
      }),
      expect.objectContaining({
        action: 'insert',
        values: expect.objectContaining({
          dealId: 'deal-1',
          fromStageId: null,
          kind: 'created',
          pipelineId: 'pipeline-1',
          tenantId: 'tenant-1',
          toStageId: 'stage-won',
        }),
      }),
    ]);
  });

  it('refuses non-EUR legacy mirror writes before opening a transaction', async () => {
    const fake = createFakeDb();
    const repository = createCrmDealRepository(fake.db as never);

    await expect(
      repository.createDealWithStageHistory({
        deal: { ...deal, currencyCode: 'USD' },
        history,
      })
    ).rejects.toMatchObject(new CrmDealRepositoryFailure('invalid_currency'));

    expect(fake.db.transaction).not.toHaveBeenCalled();
  });

  it('rejects concurrent stage moves when the expected current stage no longer matches', async () => {
    const fake = createFakeDb({ updateRows: [] });
    fake.db.query.crmPipelineStages.findFirst.mockResolvedValueOnce(stageCommit);
    const repository = createCrmDealRepository(fake.db as never);

    await expect(
      repository.updateDealWithStageHistory({
        deal: {
          ...deal,
          closedAt: null,
          currentStageId: 'stage-commit',
          forecastCategory: 'pipeline',
        },
        history,
      })
    ).rejects.toMatchObject(new CrmDealRepositoryFailure('stage_drift'));

    expect(fake.calls).toContainEqual(expect.objectContaining({ action: 'updateWhere' }));
    expect(fake.calls).not.toContainEqual(
      expect.objectContaining({
        action: 'insert',
        values: expect.objectContaining({ id: 'history-1' }),
      })
    );
  });
});
