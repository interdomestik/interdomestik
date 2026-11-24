import './submit-test-mocks';
import { describe, expect, it, vi } from 'vitest';

import {
  appendEventMock,
  buildEvidenceFile,
  buildSubmitArgs,
  createClaimResponseRequestMock,
  enqueueClaimSubmittedNotificationMock,
  enqueueStaffClaimNotificationMock,
  getActiveSubscriptionMock,
  logAuditEventMock,
  nanoidMock,
  queueClaimDocumentAiWorkflowsMock,
  lockClaimEvidenceObjectsMock,
  txCalls,
  txInsert,
  txInsertValues,
  txQuery,
  txSelectRows,
} from './submit-test-support';
import { ClaimValidationError, submitClaimCore } from './submit';

describe('submitClaimCore', () => {
  it('redacts bound claim data when persistence fails', async () => {
    const args = buildSubmitArgs({ files: [] });
    args.trustedClaimId = 'claim-with-persistence-error';
    txInsertValues.mockRejectedValueOnce(
      Object.assign(new Error(`query parameters: ${args.data.description}`), { code: '23514' })
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(submitClaimCore(args)).rejects.toThrow(
        'Failed to create claim. Please try again.'
      );
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Failed to create claim:',
        expect.objectContaining({
          message: 'Failed to create claim:',
          cause: { name: 'Error', code: '23514' },
        })
      );
    } finally {
      log.mockRestore();
    }
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
      deliveryIds: ['member-email', 'staff-email'],
    });
    expect(txInsert).toHaveBeenNthCalledWith(1, { __name: 'claim' });
    expect(txInsert).toHaveBeenNthCalledWith(2, { __name: 'claim_stage_history' });
    expect(txInsert).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ __name: 'claim_documents' })
    );
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
    // The notifications are written through the live handle of the transaction that wrote the
    // claim, so they commit or roll back with it.
    const claimWrite = txCalls.find(call => call.op === 'insert:claim');
    expect(claimWrite?.handle).toBeGreaterThan(0);
    const liveTx = expect.objectContaining({ handle: claimWrite?.handle });
    expect(enqueueClaimSubmittedNotificationMock).toHaveBeenCalledWith(
      liveTx,
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        recipient: { id: 'member-1' },
      })
    );
    expect(enqueueStaffClaimNotificationMock).toHaveBeenCalledWith(
      liveTx,
      expect.objectContaining({ claimId: 'claim-1', claimNumber: 'CLM-T1-2026-000001' }),
      { kind: 'staff_claim_submitted' },
      [{ id: 'staff-1' }]
    );
    expect(createClaimResponseRequestMock).toHaveBeenCalledWith(
      liveTx,
      expect.objectContaining({ claimId: 'claim-1', tenantId: 'tenant-1', kind: 'claim_submitted' })
    );
  });

  it('locks and re-reads each evidence object in the transaction that writes the claim and its documents', async () => {
    await submitClaimCore(buildSubmitArgs(), {
      validateSubmittedClaimFile: vi.fn().mockResolvedValue(undefined),
    });

    expect(lockClaimEvidenceObjectsMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', [
      expect.objectContaining({
        bucket: 'claim-evidence',
        path: 'pii/tenants/tenant-1/claims/member-1/unassigned/upload-1-evidence.pdf',
      }),
    ]);
    const writes = [
      'insert:claim',
      'insert:claim_stage_history',
      'lock',
      'select',
      'insert:claim_documents',
    ];
    const calls = txCalls.filter(call => writes.includes(call.op));
    expect(calls.map(call => call.op)).toEqual(writes);
    // One open tenant transaction for all of them, each through that transaction's live handle:
    // an earlier, already committed transaction or a stale handle would not do.
    const live = calls[0]?.context ?? 0;
    expect(live).toBeGreaterThan(0);
    expect(calls).toEqual(writes.map(op => ({ context: live, handle: live, op })));
  });

  it('refuses, typed, an evidence object that is already the document of a claim', async () => {
    txSelectRows.mockResolvedValueOnce([
      {
        bucket: 'claim-evidence',
        claimId: 'claim-other',
        filePath: 'pii/tenants/tenant-1/claims/member-1/unassigned/upload-1-evidence.pdf',
      },
    ]);

    const submission = submitClaimCore(buildSubmitArgs(), {
      validateSubmittedClaimFile: vi.fn().mockResolvedValue(undefined),
    });

    await expect(submission).rejects.toBeInstanceOf(ClaimValidationError);
    await expect(submission).rejects.toMatchObject({ code: 'INVALID_PATH' });
    expect(txInsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ __name: 'claim_documents' })
    );
  });

  it('refuses the same evidence object twice in one submission before anything is written', async () => {
    const file = buildEvidenceFile();

    const submission = submitClaimCore(buildSubmitArgs({ files: [file, { ...file }] }), {
      validateSubmittedClaimFile: vi.fn().mockResolvedValue(undefined),
    });

    await expect(submission).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    expect(txInsert).not.toHaveBeenCalled();
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
