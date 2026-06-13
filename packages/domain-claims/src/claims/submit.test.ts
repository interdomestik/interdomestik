import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const txInsertValues = vi.fn().mockResolvedValue(undefined);
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const transaction = vi.fn(async (callback: (tx: { insert: typeof txInsert }) => Promise<void>) =>
    callback({ insert: txInsert })
  );

  return {
    db: {
      query: {
        agentClients: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        tenantSettings: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        user: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      transaction,
    },
    ensureTenantId: vi.fn(() => 'tenant-1'),
    getActiveSubscription: vi.fn().mockResolvedValue({
      branchId: 'branch-1',
      agentId: 'agent-1',
    }),
    nanoid: vi.fn().mockReturnValueOnce('claim-1').mockReturnValueOnce('legacy-doc-1'),
    queueClaimDocumentAiWorkflows: vi.fn().mockResolvedValue([
      {
        runId: 'run-1',
        workflow: 'claim_intake_extract',
        claimId: 'claim-1',
        documentId: 'legacy-doc-1',
      },
    ]),
    generateClaimNumber: vi.fn().mockResolvedValue('CLM-T1-2026-000001'),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
    txInsert,
    txInsertValues,
  };
});

vi.mock('@interdomestik/database', () => ({
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  agentClients: {
    tenantId: 'agent_clients.tenant_id',
    memberId: 'agent_clients.member_id',
    agentId: 'agent_clients.agent_id',
    status: 'agent_clients.status',
  },
  claimDocuments: { __name: 'claim_documents' },
  claimStageHistory: { __name: 'claim_stage_history' },
  claims: { __name: 'claim' },
  db: hoisted.db,
  tenantSettings: {
    tenantId: 'tenant_settings.tenant_id',
    category: 'tenant_settings.category',
    key: 'tenant_settings.key',
  },
}));

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: hoisted.getActiveSubscription,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId: string, tenantColumn: unknown, condition?: unknown) => ({
    __op: 'withTenant',
    tenantId,
    tenantColumn,
    condition,
  })),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
}));

vi.mock('nanoid', () => ({
  nanoid: hoisted.nanoid,
}));

vi.mock('@interdomestik/database/claim-number', () => ({
  generateClaimNumber: hoisted.generateClaimNumber,
}));

vi.mock('./ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: hoisted.queueClaimDocumentAiWorkflows,
}));

import { appendEvent } from '@interdomestik/database';
import { submitClaimCore } from './submit';
import { MAX_CLAIM_EVIDENCE_FILES } from '../validators/claims';

type SubmitClaimArgs = Parameters<typeof submitClaimCore>[0];
type SubmitClaimFile = NonNullable<SubmitClaimArgs['data']['files']>[number];

function buildEvidenceFile(overrides: Partial<SubmitClaimFile> = {}): SubmitClaimFile {
  return {
    id: 'upload-1',
    name: 'evidence.pdf',
    path: 'pii/tenants/tenant-1/claims/member-1/unassigned/upload-1-evidence.pdf',
    type: 'application/pdf',
    size: 1024,
    bucket: 'claim-evidence',
    classification: 'pii',
    category: 'evidence',
    uploadIntentToken: 'server-issued-upload-intent',
    ...overrides,
  };
}

function buildClaimData(files: SubmitClaimFile[] = [buildEvidenceFile()]): SubmitClaimArgs['data'] {
  return {
    title: 'Delay',
    description: 'Delayed overnight costs.',
    category: 'travel',
    companyName: 'Airline Co',
    claimAmount: '650.00',
    currency: 'EUR',
    incidentDate: '2026-02-15',
    files,
  };
}

function buildSubmitArgs(
  overrides: Partial<Pick<SubmitClaimArgs, 'handoffContext'>> & { files?: SubmitClaimFile[] } = {}
): SubmitClaimArgs {
  return {
    session: {
      user: {
        id: 'member-1',
        role: 'member',
        tenantId: 'tenant-1',
        email: 'member@example.com',
      },
    },
    requestHeaders: new Headers(),
    handoffContext: overrides.handoffContext,
    data: buildClaimData(overrides.files),
  };
}

describe('submitClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.nanoid.mockReturnValueOnce('claim-1').mockReturnValueOnce('legacy-doc-1');
    hoisted.queueClaimDocumentAiWorkflows.mockResolvedValue([
      {
        runId: 'run-1',
        workflow: 'claim_intake_extract',
        claimId: 'claim-1',
        documentId: 'legacy-doc-1',
      },
    ]);
    hoisted.generateClaimNumber.mockResolvedValue('CLM-T1-2026-000001');
    hoisted.db.query.agentClients.findFirst.mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue(null);
    hoisted.db.query.user.findFirst.mockResolvedValue(null);
    hoisted.getActiveSubscription.mockResolvedValue({
      branchId: 'branch-1',
      agentId: 'agent-1',
    });
  });

  it('queues claim AI after documents persist', async () => {
    const dispatchClaimAiRun = vi.fn().mockResolvedValue(undefined);
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);

    const result = await submitClaimCore(
      buildSubmitArgs({
        handoffContext: {
          source: 'diaspora-green-card',
          country: 'IT',
          incidentLocation: 'abroad',
        },
      }),
      {
        dispatchClaimAiRun,
        validateSubmittedClaimFile,
      }
    );

    expect(result).toEqual({
      success: true,
      claimId: 'claim-1',
      claimNumber: 'CLM-T1-2026-000001',
    });
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(1, { __name: 'claim' });
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(2, { __name: 'claim_stage_history' });
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(3, { __name: 'claim_documents' });
    const stageHistoryRow = hoisted.txInsertValues.mock.calls[1]?.[0] as { createdAt?: Date };
    const caseCreatedEvent = vi.mocked(appendEvent).mock.calls[0]?.[1];
    expect(stageHistoryRow.createdAt).toBe(caseCreatedEvent?.createdAt);
    expect(appendEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        aggregateVersion: 1,
        entity: { id: 'claim-1', type: 'case' },
        eventName: 'case.created',
        eventVersion: 1,
        payload: {
          hasDocuments: true,
          initialStatus: 'submitted',
        },
        tenantId: 'tenant-1',
      })
    );
    expect(hoisted.queueClaimDocumentAiWorkflows).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
        claimSnapshot: expect.objectContaining({
          incidentDate: '2026-02-15',
        }),
      })
    );
    expect(dispatchClaimAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'run-1',
        workflow: 'claim_intake_extract',
      })
    );
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

  it('rejects evidence without upload intent before writes', async () => {
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      submitClaimCore(
        buildSubmitArgs({
          files: [buildEvidenceFile({ uploadIntentToken: undefined })],
        }),
        { validateSubmittedClaimFile }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_PATH',
      message: 'Upload confirmation expired. Please retry upload.',
    });

    expect(validateSubmittedClaimFile).not.toHaveBeenCalled();
    expect(hoisted.txInsert).not.toHaveBeenCalled();
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it('rejects evidence when object validation fails before writes', async () => {
    const validateSubmittedClaimFile = vi
      .fn()
      .mockRejectedValue(new Error('Uploaded file was not found. Please retry upload.'));

    await expect(
      submitClaimCore(buildSubmitArgs(), {
        validateSubmittedClaimFile,
      })
    ).rejects.toThrow('Uploaded file was not found. Please retry upload.');

    expect(validateSubmittedClaimFile).toHaveBeenCalledOnce();
    expect(hoisted.txInsert).not.toHaveBeenCalled();
  });

  it('fails when evidence validation is not wired', async () => {
    await expect(submitClaimCore(buildSubmitArgs())).rejects.toThrow(
      'Submitted claim file validation is not configured.'
    );

    expect(hoisted.txInsert).not.toHaveBeenCalled();
  });

  it('rejects too many evidence files before writes', async () => {
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);
    const files = Array.from({ length: MAX_CLAIM_EVIDENCE_FILES + 1 }, (_, index) => ({
      id: `upload-${index}`,
      name: `evidence-${index}.pdf`,
      path: `pii/tenants/tenant-1/claims/member-1/unassigned/upload-${index}-evidence.pdf`,
      type: 'application/pdf',
      size: 1024,
      bucket: 'claim-evidence',
      classification: 'pii',
      category: 'evidence' as const,
      uploadIntentToken: 'server-issued-upload-intent',
    }));

    await expect(
      submitClaimCore(buildSubmitArgs({ files }), {
        validateSubmittedClaimFile,
      })
    ).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });

    expect(validateSubmittedClaimFile).not.toHaveBeenCalled();
    expect(hoisted.txInsert).not.toHaveBeenCalled();
  });

  it('derives branchId from assigned agent fallback', async () => {
    hoisted.getActiveSubscription.mockResolvedValue({
      branchId: null,
      agentId: 'agent-42',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({ branchId: 'ks-branch-a' });

    await submitClaimCore(buildSubmitArgs({ files: [] }));

    expect(hoisted.db.query.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { branchId: true },
      })
    );
    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        branchId: 'ks-branch-a',
        agentId: 'agent-42',
      })
    );
  });

  it('omits diaspora note without handoff context', async () => {
    await submitClaimCore(buildSubmitArgs({ files: [] }));

    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        note: null,
      })
    );
  });

  it('records claim attribution audit metadata', async () => {
    await submitClaimCore(buildSubmitArgs({ files: [] }), {
      logAuditEvent: hoisted.logAuditEvent,
    });

    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
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
    hoisted.getActiveSubscription.mockResolvedValue({
      branchId: null,
      agentId: 'agent-stale',
    });
    hoisted.db.query.agentClients.findFirst.mockResolvedValue({
      agentId: 'agent-canonical',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({ branchId: 'branch-canonical' });

    await submitClaimCore(buildSubmitArgs({ files: [] }), {
      logAuditEvent: hoisted.logAuditEvent,
    });

    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        branchId: 'branch-canonical',
        agentId: 'agent-canonical',
      })
    );
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
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
  });
});
