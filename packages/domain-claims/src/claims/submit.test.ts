import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const txInsertValues = vi.fn().mockResolvedValue(undefined);
  const txInsert = vi.fn(() => ({
    values: txInsertValues,
  }));
  const transaction = vi.fn(async (callback: (tx: { insert: typeof txInsert }) => Promise<void>) =>
    callback({ insert: txInsert })
  );

  return {
    db: {
      query: {
        tenantSettings: {
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
    txInsert,
  };
});

vi.mock('@interdomestik/database', () => ({
  claimDocuments: { __name: 'claim_documents' },
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

vi.mock('./ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: hoisted.queueClaimDocumentAiWorkflows,
}));

import { submitClaimCore } from './submit';

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
  });

  it('queues claim AI workflows after persisting the submitted claim documents', async () => {
    const dispatchClaimAiRun = vi.fn().mockResolvedValue(undefined);

    const result = await submitClaimCore(
      {
        session: {
          user: {
            id: 'member-1',
            role: 'member',
            tenantId: 'tenant-1',
            email: 'member@example.com',
          },
        },
        requestHeaders: new Headers(),
        data: {
          title: 'Flight delay claim',
          description: 'My flight was delayed overnight and I incurred hotel costs.',
          category: 'travel',
          companyName: 'Airline Co',
          claimAmount: '650.00',
          currency: 'EUR',
          incidentDate: '2026-02-15',
          files: [
            {
              id: 'upload-1',
              name: 'evidence.pdf',
              path: 'pii/tenants/tenant-1/claims/member-1/unassigned/upload-1-evidence.pdf',
              type: 'application/pdf',
              size: 1024,
              bucket: 'claim-evidence',
              classification: 'pii',
              category: 'evidence',
            },
          ],
        },
      },
      {
        dispatchClaimAiRun,
      }
    );

    expect(result).toEqual({ success: true, claimId: 'claim-1' });
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(1, { __name: 'claim' });
    expect(hoisted.txInsert).toHaveBeenNthCalledWith(2, { __name: 'claim_documents' });
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
  });
});
