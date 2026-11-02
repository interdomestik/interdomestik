import { mocks, authority } from './claim-pipeline-run.document-lifecycle.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { claimClaimAiRun } from './claim-pipeline-run';

const otherAuthority = mintTestTenantAuthority('tenant_other');

const activeRun = (
  status: 'queued' | 'processing' | 'completed' | 'failed',
  errorCode: string | null = null
) => ({
  claimId: 'claim-1',
  documentId: 'doc-1',
  errorCode,
  requestedBy: 'user-1',
  status,
  subjectId: 'member-1',
  tenantId: 'tenant_mk',
  workflow: 'claim_intake_extract',
});

describe('claimClaimAiRun document lifecycle guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.where.mockResolvedValue([]);
    mocks.failDeletedDocumentClaimAiRun.mockResolvedValue(null);
    mocks.updateReturning.mockResolvedValue([{ id: 'run-1' }]);
  });

  it('runs the run lookup inside the event tenant context with a tenant predicate', async () => {
    mocks.where.mockResolvedValue([activeRun('queued')]);

    await claimClaimAiRun('run-1', { authority });

    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.where).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.id', right: 'run-1' },
          { op: 'eq', left: 'ai_runs.tenant_id', right: 'tenant_mk' },
        ]),
      })
    );
  });

  it('claims the run in the event tenant context with a tenant-bound update predicate', async () => {
    mocks.where.mockResolvedValue([activeRun('queued')]);

    const claimed = await claimClaimAiRun('run-1', { authority });

    expect(claimed.status).toBe('claimed');
    if (claimed.status !== 'claimed') throw new Error('expected a claimed run');
    expect(claimed.run.authority).toBe(authority);

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(2);
    expect(mocks.withTenantContext.mock.calls[1]?.[0]).toBe(authority);
    expect(mocks.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.id', right: 'run-1' },
          { op: 'eq', left: 'ai_runs.tenant_id', right: 'tenant_mk' },
          { op: 'eq', left: 'ai_runs.status', right: 'queued' },
        ]),
      })
    );
  });

  it('does not update a run that belongs to another tenant', async () => {
    // The tenant-scoped lookup finds no row for a run owned by a different tenant.
    mocks.where.mockResolvedValue([]);
    mocks.failDeletedDocumentClaimAiRun.mockResolvedValue({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });

    await claimClaimAiRun('run-1', { authority: otherAuthority });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(otherAuthority);
    expect(mocks.failDeletedDocumentClaimAiRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(Function),
      { authority: otherAuthority }
    );
    expect(mocks.failDeletedDocumentClaimAiRun.mock.calls[0]?.[2].authority).toBe(otherAuthority);
  });

  it('throws not found without updating when no row exists in the tenant and the fallback finds none', async () => {
    mocks.where.mockResolvedValue([]);
    mocks.failDeletedDocumentClaimAiRun.mockResolvedValue(null);

    await expect(claimClaimAiRun('run-1', { authority: otherAuthority })).rejects.toThrow(
      'Queued claim AI run run-1 was not found.'
    );

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
});
