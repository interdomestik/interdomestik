import { describe, expect, it, vi } from 'vitest';

import type { CrmActorContext } from '../context';
import type { CrmPipeline, CrmPipelineRepository, CrmPipelineStage } from './repository';
import {
  addCrmPipelineStage,
  archiveCrmPipeline,
  createCrmPipeline,
  reorderCrmPipelineStages,
  updateCrmPipelineStage,
} from './mutations';

const now = '2026-05-13T20:00:00.000Z';

const adminActor: CrmActorContext = {
  actorId: 'admin-1',
  role: 'admin',
  scope: {},
  tenantId: 'tenant-1',
};

const branchManagerActor: CrmActorContext = {
  actorId: 'manager-1',
  role: 'branch_manager',
  scope: { branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const agentActor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};

const defaultStages = [
  { name: 'Qualified', order: 10, probability: 20 },
  { name: 'Commit', order: 20, probability: 80 },
  { name: 'Won', order: 30, probability: 100, isWon: true },
  { name: 'Lost', order: 40, probability: 0, isLost: true },
] as const;

class InMemoryCrmPipelines implements CrmPipelineRepository {
  readonly pipelines: CrmPipeline[] = [];

  async createPipeline(params: { pipeline: CrmPipeline }): Promise<CrmPipeline> {
    this.pipelines.push(params.pipeline);
    return params.pipeline;
  }

  async findPipelineById(params: {
    pipelineId: string;
    tenantId: string;
  }): Promise<CrmPipeline | null> {
    return (
      this.pipelines.find(
        pipeline => pipeline.id === params.pipelineId && pipeline.tenantId === params.tenantId
      ) ?? null
    );
  }

  async updatePipeline(params: { pipeline: CrmPipeline }): Promise<CrmPipeline> {
    const index = this.pipelines.findIndex(pipeline => pipeline.id === params.pipeline.id);
    if (index >= 0) this.pipelines[index] = params.pipeline;
    return params.pipeline;
  }
}

function pipelineStage(overrides: Partial<CrmPipelineStage>): CrmPipelineStage {
  return {
    id: 'stage-qualified',
    isLost: false,
    isWon: false,
    name: 'Qualified',
    order: 10,
    pipelineId: 'pipeline-1',
    probability: 20,
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function persistedPipeline(overrides: Partial<CrmPipeline> = {}): CrmPipeline {
  return {
    archivedAt: null,
    archivedById: null,
    branchId: 'branch-1',
    createdAt: now,
    id: 'pipeline-1',
    name: 'Residential Sales',
    stages: [
      pipelineStage({}),
      pipelineStage({
        id: 'stage-won',
        isWon: true,
        name: 'Won',
        order: 30,
        probability: 100,
      }),
      pipelineStage({
        id: 'stage-lost',
        isLost: true,
        name: 'Lost',
        order: 40,
        probability: 0,
      }),
    ],
    tenantId: 'tenant-1',
    updatedAt: now,
    ...overrides,
  };
}

describe('CRM pipelines domain', () => {
  it('creates a tenant-scoped pipeline with deterministic stage identifiers', async () => {
    const repository = new InMemoryCrmPipelines();
    const ids = {
      pipelineId: vi.fn(() => 'pipeline-1'),
      pipelineStageId: vi
        .fn()
        .mockReturnValueOnce('stage-qualified')
        .mockReturnValueOnce('stage-commit')
        .mockReturnValueOnce('stage-won')
        .mockReturnValueOnce('stage-lost'),
    };

    await expect(
      createCrmPipeline(
        {
          actor: adminActor,
          name: 'Residential Sales',
          stages: defaultStages,
          tenantId: 'tenant-1',
        },
        repository,
        { clock: { now: () => now }, ids }
      )
    ).resolves.toEqual({
      pipeline: {
        archivedAt: null,
        archivedById: null,
        branchId: null,
        createdAt: now,
        id: 'pipeline-1',
        name: 'Residential Sales',
        stages: [
          expect.objectContaining({ id: 'stage-qualified', isLost: false, isWon: false }),
          expect.objectContaining({ id: 'stage-commit', isLost: false, isWon: false }),
          expect.objectContaining({ id: 'stage-won', isLost: false, isWon: true }),
          expect.objectContaining({ id: 'stage-lost', isLost: true, isWon: false }),
        ],
        tenantId: 'tenant-1',
        updatedAt: now,
      },
      success: true,
    });
    expect(ids.pipelineId).toHaveBeenCalledOnce();
    expect(ids.pipelineStageId).toHaveBeenCalledTimes(4);
    expect(repository.pipelines).toHaveLength(1);
  });

  it('rejects invalid stage order, probability, terminal flags, and missing terminal stages', async () => {
    const invalidStageSets = [
      [
        { name: 'One', order: 10, probability: 10 },
        { name: 'Duplicate', order: 10, probability: 20 },
        { name: 'Won', order: 30, probability: 100, isWon: true },
        { name: 'Lost', order: 40, probability: 0, isLost: true },
      ],
      [
        { name: 'Bad', order: 10, probability: 120 },
        { name: 'Won', order: 20, probability: 100, isWon: true },
        { name: 'Lost', order: 30, probability: 0, isLost: true },
      ],
      [
        { name: 'Both', order: 10, probability: 100, isWon: true, isLost: true },
        { name: 'Lost', order: 20, probability: 0, isLost: true },
      ],
      [
        { name: 'Open', order: 10, probability: 20 },
        { name: 'Won', order: 20, probability: 100, isWon: true },
      ],
    ];

    for (const stages of invalidStageSets) {
      const repository = new InMemoryCrmPipelines();
      const result = await createCrmPipeline(
        {
          actor: adminActor,
          name: 'Invalid',
          stages,
          tenantId: 'tenant-1',
        },
        repository,
        {
          clock: { now: () => now },
          ids: { pipelineId: () => 'pipeline-1', pipelineStageId: () => 'stage-1' },
        }
      );

      expect(result.success).toBe(false);
      expect(repository.pipelines).toHaveLength(0);
    }
  });

  it('enforces pipeline authoring roles and branch-manager branch scope', async () => {
    const repository = new InMemoryCrmPipelines();

    await expect(
      createCrmPipeline(
        {
          actor: agentActor,
          branchId: 'branch-1',
          name: 'Agent Pipeline',
          stages: defaultStages,
          tenantId: 'tenant-1',
        },
        repository,
        {
          clock: { now: () => now },
          ids: { pipelineId: () => 'pipeline-1', pipelineStageId: () => 'stage-1' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'role_scope' });

    await expect(
      createCrmPipeline(
        {
          actor: branchManagerActor,
          branchId: 'branch-2',
          name: 'Wrong Branch',
          stages: defaultStages,
          tenantId: 'tenant-1',
        },
        repository,
        {
          clock: { now: () => now },
          ids: { pipelineId: () => 'pipeline-1', pipelineStageId: () => 'stage-1' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'forbidden', reason: 'branch_scope' });
  });

  it('adds, edits, and reorders stages while preserving terminal-stage invariants', async () => {
    const repository = new InMemoryCrmPipelines();
    repository.pipelines.push(persistedPipeline());

    const added = await addCrmPipelineStage(
      {
        actor: branchManagerActor,
        pipelineId: 'pipeline-1',
        stage: { expectedDurationDays: 14, name: 'Commit', order: 20, probability: 75 },
        tenantId: 'tenant-1',
      },
      repository,
      {
        clock: { now: () => '2026-05-13T20:05:00.000Z' },
        ids: { pipelineStageId: () => 'stage-commit' },
      }
    );

    expect(added).toEqual({
      pipeline: expect.objectContaining({
        stages: expect.arrayContaining([
          expect.objectContaining({
            expectedDurationDays: 14,
            id: 'stage-commit',
            name: 'Commit',
            order: 20,
            probability: 75,
          }),
        ]),
        updatedAt: '2026-05-13T20:05:00.000Z',
      }),
      success: true,
    });

    await expect(
      updateCrmPipelineStage(
        {
          actor: branchManagerActor,
          expectedDurationDays: 21,
          pipelineId: 'pipeline-1',
          probability: 80,
          stageId: 'stage-commit',
          tenantId: 'tenant-1',
        },
        repository,
        { clock: { now: () => '2026-05-13T20:06:00.000Z' } }
      )
    ).resolves.toEqual({
      pipeline: expect.objectContaining({
        stages: expect.arrayContaining([
          expect.objectContaining({
            expectedDurationDays: 21,
            id: 'stage-commit',
            probability: 80,
          }),
        ]),
        updatedAt: '2026-05-13T20:06:00.000Z',
      }),
      success: true,
    });

    await expect(
      reorderCrmPipelineStages(
        {
          actor: branchManagerActor,
          pipelineId: 'pipeline-1',
          stageOrders: [
            { order: 10, stageId: 'stage-commit' },
            { order: 20, stageId: 'stage-qualified' },
            { order: 30, stageId: 'stage-won' },
            { order: 40, stageId: 'stage-lost' },
          ],
          tenantId: 'tenant-1',
        },
        repository,
        { clock: { now: () => '2026-05-13T20:07:00.000Z' } }
      )
    ).resolves.toEqual({
      pipeline: expect.objectContaining({
        stages: [
          expect.objectContaining({ id: 'stage-qualified', order: 20 }),
          expect.objectContaining({ id: 'stage-won', order: 30 }),
          expect.objectContaining({ id: 'stage-lost', order: 40 }),
          expect.objectContaining({ id: 'stage-commit', order: 10 }),
        ],
      }),
      success: true,
    });
  });

  it('archives branch-scoped pipelines and rejects changes to archived pipelines', async () => {
    const repository = new InMemoryCrmPipelines();
    repository.pipelines.push(persistedPipeline());

    await expect(
      archiveCrmPipeline(
        {
          actor: branchManagerActor,
          pipelineId: 'pipeline-1',
          tenantId: 'tenant-1',
        },
        repository,
        { clock: { now: () => '2026-05-13T20:08:00.000Z' } }
      )
    ).resolves.toEqual({
      pipeline: expect.objectContaining({
        archivedAt: '2026-05-13T20:08:00.000Z',
        archivedById: 'manager-1',
        updatedAt: '2026-05-13T20:08:00.000Z',
      }),
      success: true,
    });

    await expect(
      addCrmPipelineStage(
        {
          actor: branchManagerActor,
          pipelineId: 'pipeline-1',
          stage: { name: 'Late Commit', order: 25, probability: 90 },
          tenantId: 'tenant-1',
        },
        repository,
        {
          clock: { now: () => '2026-05-13T20:09:00.000Z' },
          ids: { pipelineStageId: () => 'stage-late' },
        }
      )
    ).resolves.toEqual({ success: false, error: 'invalid_input', reason: 'archived_pipeline' });
  });
});
