import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', async () =>
  (await import('./submit-test-support')).databaseModuleMock()
);
vi.mock('@interdomestik/database/tenant-security', async () =>
  (await import('./submit-test-support')).tenantSecurityModuleMock()
);
vi.mock('drizzle-orm', async () => (await import('./submit-test-support')).drizzleModuleMock());
vi.mock('@interdomestik/database/claim-number', async () => ({
  generateClaimNumber: (await import('./submit-test-support')).generateClaimNumberMock,
}));
vi.mock('@interdomestik/database/tenant-directory', async () => ({
  readTenantLocaleMetadata: (await import('./submit-test-support')).readTenantLocaleMetadataMock,
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', async () => ({
  getActiveSubscription: (await import('./submit-test-support')).getActiveSubscriptionMock,
}));
vi.mock('@interdomestik/shared-auth', async () => ({
  ensureTenantId: (await import('./submit-test-support')).ensureTenantIdMock,
}));
vi.mock('nanoid', async () => ({ nanoid: (await import('./submit-test-support')).nanoidMock }));
vi.mock('./ai-workflows', async () => ({
  queueClaimDocumentAiWorkflows: (await import('./submit-test-support'))
    .queueClaimDocumentAiWorkflowsMock,
}));

import {
  appendEventMock,
  buildEvidenceFile,
  buildSubmitArgs,
  getActiveSubscriptionMock,
  logAuditEventMock,
  nanoidMock,
  queueClaimDocumentAiWorkflowsMock,
  resetSubmitClaimMocks,
  txInsert,
  txInsertValues,
  txQuery,
} from './submit-test-support';
import { submitClaimCore } from './submit';

describe('submitClaimCore', () => {
  beforeEach(() => {
    resetSubmitClaimMocks();
  });

  it('persists initial documents without queueing AI when no explicit extraction consent exists', async () => {
    const dispatchClaimAiRun = vi.fn().mockResolvedValue(undefined);
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);
    const result = await submitClaimCore(
      buildSubmitArgs({
        handoffContext: {
          source: 'diaspora-green-card',
          country: 'IT',
          incidentLocation: 'abroad',
        },
        hostId: 'tenant_ks',
      }),
      { dispatchClaimAiRun, validateSubmittedClaimFile }
    );
    expect(result).toEqual({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });
    expect(txInsert).toHaveBeenNthCalledWith(1, { __name: 'claim' });
    expect(txInsert).toHaveBeenNthCalledWith(2, { __name: 'claim_stage_history' });
    expect(txInsert).toHaveBeenNthCalledWith(3, { __name: 'claim_documents' });
    const stageHistoryRow = txInsertValues.mock.calls[1]?.[0] as { createdAt?: Date };
    const caseCreatedEvent = appendEventMock.mock.calls[0]?.[1];
    expect(stageHistoryRow.createdAt).toBe(caseCreatedEvent?.createdAt);
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        aggregateVersion: 1,
        entity: { id: 'claim-1', type: 'case' },
        eventName: 'case.created',
        eventVersion: 1,
        hostId: 'tenant_ks',
        payload: { hasDocuments: true, initialStatus: 'submitted' },
        tenantId: 'tenant-1',
      })
    );
    expect(queueClaimDocumentAiWorkflowsMock).not.toHaveBeenCalled();
    expect(dispatchClaimAiRun).not.toHaveBeenCalled();
    expect(validateSubmittedClaimFile).toHaveBeenCalledWith({
      actorId: 'member-1',
      tenantId: 'tenant-1',
      file: expect.objectContaining({
        id: 'upload-1',
        path: 'pii/tenants/tenant-1/claims/member-1/unassigned/upload-1-evidence.pdf',
        uploadIntentToken: 'server-issued-upload-intent',
      }),
    });
  });

  it('omits diaspora note without handoff context', async () => {
    await submitClaimCore(buildSubmitArgs({ files: [] }));

    expect(txInsertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({ note: null }));
  });

  it('derives branchId from assigned agent fallback', async () => {
    getActiveSubscriptionMock.mockResolvedValue({ branchId: null, agentId: 'agent-42' });
    txQuery.user.findFirst.mockResolvedValue({ branchId: 'ks-branch-a' });

    await submitClaimCore(buildSubmitArgs({ files: [] }));

    expect(txQuery.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ columns: { branchId: true } })
    );
    expect(txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ branchId: 'ks-branch-a', agentId: 'agent-42' })
    );
  });

  it('records claim attribution audit metadata', async () => {
    await submitClaimCore(buildSubmitArgs({ files: [] }), { logAuditEvent: logAuditEventMock });

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.submitted',
        metadata: expect.objectContaining({
          agentId: 'agent-1',
          agentAttributionSource: 'subscription',
          branchId: 'branch-1',
          branchResolutionSource: 'subscription',
        }),
      })
    );
  });

  it('prefers active agent_clients ownership for assignment', async () => {
    getActiveSubscriptionMock.mockResolvedValue({ branchId: null, agentId: 'agent-stale' });
    txQuery.agentClients.findFirst.mockResolvedValue({ agentId: 'agent-canonical' });
    txQuery.user.findFirst.mockResolvedValue({ branchId: 'branch-canonical' });

    await submitClaimCore(
      { ...buildSubmitArgs({ files: [] }), trustedClaimId: 'fsd_authorized-claim-id' },
      { logAuditEvent: logAuditEventMock }
    );

    expect(txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'fsd_authorized-claim-id',
        branchId: 'branch-canonical',
        agentId: 'agent-canonical',
      })
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.submitted',
        metadata: expect.objectContaining({
          agentId: 'agent-canonical',
          agentAttributionSource: 'agent_clients',
          branchId: 'branch-canonical',
          branchResolutionSource: 'agent',
        }),
      })
    );
    expect(nanoidMock).not.toHaveBeenCalled();
  });

  it('rejects evidence without upload intent before writes', async () => {
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      submitClaimCore(
        buildSubmitArgs({ files: [buildEvidenceFile({ uploadIntentToken: undefined })] }),
        { validateSubmittedClaimFile }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_PATH',
      message: 'Upload confirmation expired. Please retry upload.',
    });

    expect(validateSubmittedClaimFile).not.toHaveBeenCalled();
    expect(txInsert).not.toHaveBeenCalled();
    expect(appendEventMock).not.toHaveBeenCalled();
  });
});
