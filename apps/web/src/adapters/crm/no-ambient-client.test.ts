import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  // A transaction double that answers every call chain and resolves to an empty result set.
  const chain: unknown = new Proxy(function chainTarget() {}, {
    apply: () => chain,
    get: (_target, property) => {
      if (property === 'then') {
        return (resolve: (value: unknown) => unknown) => resolve([]);
      }
      return chain;
    },
  });
  return { ambientDbReads: 0, chain, withTenantContext: vi.fn() };
});

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
}));

// Nothing under adapters/crm may reach the ambient client; count any read of it.
vi.mock('@interdomestik/database/db', () => ({
  get db() {
    hoisted.ambientDbReads += 1;
    return undefined;
  },
}));

import { createCrmDealRepository } from './deal-repository';
import { createCrmForecastSnapshotObservabilityRepository } from './forecast-snapshot-observability';
import { createCrmForecastSnapshotWorkItemRepository } from './forecast-snapshot-work-items';
import { createCrmLeadMutationRepository } from './lead-mutation-repository';
import { createCrmLossReasonRepository } from './loss-reason-repository';
import { createCrmPipelineRepository } from './pipeline-repository';
import {
  createCrmForecastSnapshotRepository,
  createCrmReportingRepository,
} from './reporting-repository';
import { createApplyCrmLeadRoutingDecisionCoordinator } from './routing-application-service';
import {
  createAdminCrmRoutingRuleRepository,
  createCrmRoutingRepository,
} from './routing-repository';
import { createCrmTaskRepository } from './task-repository';
import { createAgentCrmTaskWorkQueueRepository } from './task-work-queue-repository';

const actor: CrmActorContext = {
  actorId: 'agent-1',
  role: 'agent',
  scope: { agentId: 'agent-1', branchId: 'branch-1' },
  tenantId: 'tenant-1',
};
const adminActor: CrmActorContext = { ...actor, role: 'admin' };
const window = { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' };

describe('CRM repositories without an injected executor', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.ambientDbReads = 0;
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, action: (tx: unknown) => unknown) => action(hoisted.chain)
    );
  });

  const operations: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
    [
      'deal',
      () => createCrmDealRepository(authority).findDealById({ dealId: 'd', tenantId: 'tenant-1' }),
    ],
    [
      'pipeline',
      () =>
        createCrmPipelineRepository(authority).findPipelineById({
          pipelineId: 'p',
          tenantId: 'tenant-1',
        }),
    ],
    [
      'loss reason',
      () =>
        createCrmLossReasonRepository(authority).resolveLossReason({
          actor,
          lossReasonId: 'r',
        } as never),
    ],
    [
      'forecast snapshot observability',
      () =>
        createCrmForecastSnapshotObservabilityRepository(authority).listObservedSnapshots({
          snapshotDate: '2026-01-31',
          tenantId: 'tenant-1',
        }),
    ],
    [
      'forecast snapshot work items',
      () =>
        createCrmForecastSnapshotWorkItemRepository([authority]).listWorkItems({
          snapshotDateEndExclusive: new Date(window.to),
          snapshotDateStartInclusive: new Date(window.from),
        }),
    ],
    [
      'lead mutation',
      () => createCrmLeadMutationRepository(authority).findById({ actor, leadId: 'l' }),
    ],
    [
      'routing',
      () => createCrmRoutingRepository(authority).listRoutingRules({ actor: adminActor }),
    ],
    [
      'admin routing',
      () => createAdminCrmRoutingRuleRepository(authority).listBranches({ tenantId: 'tenant-1' }),
    ],
    [
      'reporting',
      () =>
        createCrmReportingRepository(authority).listWeightedPipelineRows({
          actor: adminActor,
          window,
        }),
    ],
    [
      'forecast snapshot',
      () =>
        createCrmForecastSnapshotRepository(authority).listLatestPipelineSnapshots({
          snapshotDate: '2026-01-31',
          tenantId: 'tenant-1',
        }),
    ],
    ['task', () => createCrmTaskRepository(authority).findTaskById({ actor, taskId: 't' })],
    [
      'task work queue',
      () =>
        createAgentCrmTaskWorkQueueRepository(authority).readAgentTaskWorkQueue({
          actor,
          now: window.to,
        }),
    ],
    [
      'routing application',
      () =>
        createApplyCrmLeadRoutingDecisionCoordinator({ authority })({
          actor: adminActor,
          idempotencyKey: 'k',
          leadId: 'l',
          now: window.to,
        } as never),
    ],
  ];

  it.each(operations)(
    '%s runs under the supplied authority and never the ambient db',
    async (_name, run) => {
      // The empty-result double may make a mapper throw; only the tenant boundary is under test.
      await run().catch(() => undefined);

      expect(hoisted.withTenantContext).toHaveBeenCalled();
      for (const [context] of hoisted.withTenantContext.mock.calls) expect(context).toBe(authority);
      expect(hoisted.ambientDbReads).toBe(0);
    }
  );
});
