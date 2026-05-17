import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  db: {},
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

import type { CrmPipeline } from '@interdomestik/domain-crm/pipelines/repository';

import { createCrmPipelineRepository } from './pipeline-repository';

const now = new Date('2026-05-14T08:00:00.000Z');

function pipeline(overrides: Partial<CrmPipeline> = {}): CrmPipeline {
  return {
    archivedAt: null,
    archivedById: null,
    branchId: 'branch-1',
    createdAt: now.toISOString(),
    id: 'pipeline-1',
    name: 'Residential Sales',
    stages: [
      {
        expectedDurationDays: null,
        id: 'stage-20',
        isLost: false,
        isWon: false,
        name: 'Commit',
        order: 20,
        pipelineId: 'pipeline-1',
        probability: 80,
        tenantId: 'tenant-1',
      },
    ],
    tenantId: 'tenant-1',
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

describe('crmPipelineRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads pipelines by tenant, hides archived rows, and returns ordered active stages', async () => {
    const findFirst = vi.fn(async () => ({
      archivedAt: null,
      archivedById: null,
      branchId: 'branch-1',
      createdAt: now,
      id: 'pipeline-1',
      name: 'Residential Sales',
      stages: [
        {
          expectedDurationDays: 14,
          id: 'stage-20',
          isLost: false,
          isWon: false,
          name: 'Commit',
          order: 20,
          pipelineId: 'pipeline-1',
          probability: 80,
          tenantId: 'tenant-1',
        },
        {
          expectedDurationDays: 7,
          id: 'stage-10',
          isLost: false,
          isWon: false,
          name: 'Qualified',
          order: 10,
          pipelineId: 'pipeline-1',
          probability: 20,
          tenantId: 'tenant-1',
        },
      ],
      tenantId: 'tenant-1',
      updatedAt: now,
    }));
    const fakeDb = {
      query: {
        crmPipelines: { findFirst },
      },
      transaction: vi.fn(),
    };
    const repository = createCrmPipelineRepository(fakeDb as never);

    await expect(
      repository.findPipelineById({ pipelineId: 'pipeline-1', tenantId: 'tenant-1' })
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'pipeline-1',
        stages: [
          expect.objectContaining({ id: 'stage-10', order: 10 }),
          expect.objectContaining({ id: 'stage-20', order: 20 }),
        ],
      })
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        with: expect.objectContaining({
          stages: expect.objectContaining({
            orderBy: expect.any(Array),
            where: expect.anything(),
          }),
        }),
      })
    );
  });

  it('creates pipelines and their stages in one transaction', async () => {
    const calls: unknown[] = [];
    const tx = {
      insert(table: unknown) {
        return {
          values(values: unknown) {
            calls.push({ table, values });
            return {};
          },
        };
      },
    };
    const fakeDb = {
      query: { crmPipelines: { findFirst: vi.fn() } },
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const repository = createCrmPipelineRepository(fakeDb as never);

    await expect(repository.createPipeline({ pipeline: pipeline() })).resolves.toEqual(pipeline());

    expect(fakeDb.transaction).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ id: 'pipeline-1', tenantId: 'tenant-1' }),
      }),
      expect.objectContaining({
        values: [expect.objectContaining({ id: 'stage-20', pipelineId: 'pipeline-1' })],
      }),
    ]);
  });
});
