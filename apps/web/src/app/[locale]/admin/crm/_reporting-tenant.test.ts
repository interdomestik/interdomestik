import { describe, expect, it, vi } from 'vitest';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import {
  adminActor,
  foreignActor,
  h,
  EXPECTED_OPERATIONS,
  FOREIGN_TENANT_ID,
  NOW,
  OWN_TENANT_ID,
} from './_reporting-tenant-test-setup';
import {
  ADMIN_CRM_REPORTING_READ_ONLY_MESSAGE,
  createAdminCrmReportingTenantRepositories,
  getAdminCrmReportingCore,
  type AdminCrmReportingTenantOptions,
} from './_reporting-tenant';

describe('admin CRM reporting tenant boundary', () => {
  it('binds every dashboard read to its own transaction scoped to the actor tenant', async () => {
    const logger = { error: vi.fn() };

    const dashboard = await getAdminCrmReportingCore(
      { actor: adminActor },
      { labels: { noBranch: 'no-branch' }, logger, now: () => NOW }
    );

    expect(h.withTenantContext).toHaveBeenCalledTimes(EXPECTED_OPERATIONS.length);
    for (const [context] of h.withTenantContext.mock.calls) {
      expect(context).toEqual({ tenantId: OWN_TENANT_ID });
    }
    expect([...h.state.reads].map(read => read.operation).sort()).toEqual(EXPECTED_OPERATIONS);
    // No transaction serves two reads: siblings cannot be aborted by one another.
    expect(new Set(h.state.reads.map(read => read.txId)).size).toBe(h.state.reads.length);
    expect(dashboard.snapshot.state).toBe('data');
    expect(dashboard.branchPipeline.state).toBe('data');
    expect(dashboard.sourceBreakdown.state).toBe('data');
    expect(dashboard.forecastObservability.state).toBe('data');
    expect(dashboard.generatedAt).toBe(NOW);
    // Caller labels survive the boundary unchanged.
    expect(dashboard.forecastObservability.coverageRows[0]?.branchLabel).toBe('no-branch');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps healthy widgets when one read fails with a SQL error', async () => {
    h.state.failingOperations.add('listSourceBreakdownRows');
    const logger = { error: vi.fn() };

    const dashboard = await getAdminCrmReportingCore(
      { actor: adminActor },
      { logger, now: () => NOW }
    );

    expect(dashboard.sourceBreakdown).toEqual({
      excludedRowCount: 0,
      messageKey: 'error.generic',
      rows: [],
      state: 'error',
    });
    expect(dashboard.snapshot.state).toBe('data');
    expect(dashboard.branchPipeline.state).toBe('data');
    expect(dashboard.forecastObservability.state).toBe('data');
    expect(dashboard.forecastAlert.severity).toBe('ok');
    expect(logger.error).toHaveBeenCalledTimes(1);

    const failedRead = h.state.reads.find(read => read.operation === 'listSourceBreakdownRows');
    expect(h.state.reads.filter(read => read.txId === failedRead?.txId)).toHaveLength(1);
    expect(h.state.transactions.find(entry => entry.id === failedRead?.txId)?.status).toBe(
      'rolled_back'
    );
    expect(h.state.transactions.filter(entry => entry.status === 'committed')).toHaveLength(4);
    expect(h.state.openContexts.size).toBe(0);
  });

  it('returns only rows visible inside the actor tenant context', async () => {
    const dashboard = await getAdminCrmReportingCore({ actor: foreignActor }, { now: () => NOW });

    expect(new Set(h.state.reads.map(read => read.tenantId))).toEqual(new Set([FOREIGN_TENANT_ID]));
    expect(dashboard.snapshot).toEqual({ excludedRowCount: 0, rows: [], state: 'empty' });
    expect(dashboard.branchPipeline.rows).toEqual([]);
    expect(dashboard.sourceBreakdown.rows).toEqual([]);
    expect(dashboard.forecastObservability.state).toBe('empty');
  });

  it.each([
    { actor: { ...adminActor, tenantId: '' }, reason: 'tenant_scope' },
    { actor: { ...adminActor, tenantId: '   ' }, reason: 'tenant_scope' },
    {
      actor: { ...adminActor, role: 'branch_manager', scope: { branchId: 'branch-1' } },
      reason: 'role_scope',
    },
  ] satisfies Array<{ actor: CrmActorContext; reason: string }>)(
    'denies $reason before opening a transaction',
    async ({ actor, reason }) => {
      await expect(getAdminCrmReportingCore({ actor }, { now: () => NOW })).rejects.toMatchObject({
        name: 'AdminCrmReportingAccessDeniedError',
        reason,
      });

      expect(h.withTenantContext).not.toHaveBeenCalled();
      expect(h.state.reads).toEqual([]);
    }
  );

  it('refuses snapshot writes through the read-only reporting boundary', async () => {
    const repositories = createAdminCrmReportingTenantRepositories(OWN_TENANT_ID);

    await expect(
      repositories.forecastSnapshotRepository.insertPipelineSnapshots({ snapshots: [] })
    ).rejects.toThrow(ADMIN_CRM_REPORTING_READ_ONLY_MESSAGE);
    expect(h.withTenantContext).not.toHaveBeenCalled();
  });

  it('ignores caller-supplied repositories and releases every tenant context', async () => {
    const forged = { listSourceBreakdownRows: vi.fn(), listWeightedPipelineRows: vi.fn() };
    const callerOptions = {
      now: () => NOW,
      reportingRepository: forged,
    } as unknown as AdminCrmReportingTenantOptions;

    const dashboard = await getAdminCrmReportingCore({ actor: adminActor }, callerOptions);

    expect(forged.listWeightedPipelineRows).not.toHaveBeenCalled();
    expect(forged.listSourceBreakdownRows).not.toHaveBeenCalled();
    expect(dashboard.branchPipeline.state).toBe('data');
    expect(h.state.reads).toHaveLength(EXPECTED_OPERATIONS.length);
    expect(h.state.openContexts.size).toBe(0);
    expect(
      h.state.transactions.every(
        entry => entry.status === 'committed' || entry.status === 'rolled_back'
      )
    ).toBe(true);
  });
});
