import { mocks, authority } from './claim-pipeline-run.document-lifecycle.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimClaimAiRun } from './claim-pipeline-run';

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

  it('requires an active document row before claiming queued AI work', async () => {
    await expect(claimClaimAiRun('run-1', { authority })).rejects.toThrow(
      'Queued claim AI run run-1 was not found.'
    );

    expect(mocks.isNull).toHaveBeenCalledWith('documents.deleted_at');
    expect(mocks.firstInnerJoin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.objectContaining({ field: 'documents.deleted_at', op: 'isNull' }),
        ]),
      })
    );
    expect(mocks.failDeletedDocumentClaimAiRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(Function),
      { authority }
    );
    expect(mocks.failDeletedDocumentClaimAiRun.mock.calls[0]?.[2].authority).toBe(authority);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toBe(authority);
  });

  it('does not apply the deleted-document fallback to malformed active rows', async () => {
    mocks.where.mockResolvedValue([
      {
        claimId: 'claim-1',
        documentId: 'doc-1',
        requestedBy: 'user-1',
        status: 'queued',
        subjectId: null,
        workflow: 'claim_intake_extract',
      },
    ]);

    await expect(claimClaimAiRun('run-1', { authority })).rejects.toThrow(
      'Queued claim AI run run-1 was not found.'
    );
    expect(mocks.select).toHaveBeenCalledTimes(1);
    expect(mocks.failDeletedDocumentClaimAiRun).not.toHaveBeenCalled();
  });

  it('returns skipped when the deleted-document fallback claims the lifecycle case', async () => {
    mocks.failDeletedDocumentClaimAiRun.mockResolvedValue({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });

    await expect(claimClaimAiRun('run-1', { authority, retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.failDeletedDocumentClaimAiRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(Function),
      { authority, retryFailed: true }
    );
  });

  it('reclaims only an explicitly retried generic processing failure', async () => {
    mocks.where.mockResolvedValue([activeRun('failed', 'claim_ai_processing_failed')]);

    await expect(claimClaimAiRun('run-1', { authority, retryFailed: true })).resolves.toMatchObject(
      {
        status: 'claimed',
        run: { runId: 'run-1', claimId: 'claim-1' },
      }
    );

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing', completedAt: null, errorCode: null })
    );
    expect(mocks.updateWhere).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'ai_runs.status', right: 'failed' },
          { op: 'eq', left: 'ai_runs.error_code', right: 'claim_ai_processing_failed' },
        ]),
      })
    );
  });

  it('does not claim queued work when invoked in retry mode', async () => {
    mocks.where.mockResolvedValue([activeRun('queued')]);

    await expect(claimClaimAiRun('run-1', { authority, retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('does not reclaim a generic failure without explicit retry intent', async () => {
    mocks.where.mockResolvedValue([activeRun('failed', 'claim_ai_processing_failed')]);

    await expect(claimClaimAiRun('run-1', { authority })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it.each(['claim_intake_extract_validation_failed', 'claim_ai_document_deleted'])(
    'does not resurrect permanent failure %s on a retry attempt',
    async errorCode => {
      mocks.where.mockResolvedValue([activeRun('failed', errorCode)]);

      await expect(claimClaimAiRun('run-1', { authority, retryFailed: true })).resolves.toEqual({
        status: 'skipped',
        claimId: 'claim-1',
        workflow: 'claim_intake_extract',
      });
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    }
  );

  it('does not reclaim completed work on a retry attempt', async () => {
    mocks.where.mockResolvedValue([activeRun('completed')]);

    await expect(claimClaimAiRun('run-1', { authority, retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('returns skipped when another worker wins the failed-run reclaim race', async () => {
    mocks.where.mockResolvedValue([activeRun('failed', 'claim_ai_processing_failed')]);
    mocks.updateReturning.mockResolvedValue([]);

    await expect(claimClaimAiRun('run-1', { authority, retryFailed: true })).resolves.toEqual({
      status: 'skipped',
      claimId: 'claim-1',
      workflow: 'claim_intake_extract',
    });
  });
});
