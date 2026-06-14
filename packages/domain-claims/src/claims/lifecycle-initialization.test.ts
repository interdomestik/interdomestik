import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  return {
    db: {
      query: {
        agentClients: { findFirst: vi.fn().mockResolvedValue(null) },
        tenantSettings: { findFirst: vi.fn().mockResolvedValue(null) },
        user: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      transaction: vi.fn(async (callback: (tx: { insert: typeof txInsert }) => Promise<void>) =>
        callback({ insert: txInsert })
      ),
    },
    ensureTenantId: vi.fn(() => 'tenant-1'),
    generateClaimNumber: vi.fn().mockResolvedValue('CLM-T1-2026-000001'),
    getActiveSubscription: vi.fn().mockResolvedValue({
      agentId: 'agent-1',
      branchId: 'branch-1',
    }),
    nanoid: vi.fn(),
    txInsert,
    txInsertValues,
  };
});

vi.mock('@interdomestik/database', () => ({
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  agentClients: {
    agentId: 'agent_clients.agent_id',
    memberId: 'agent_clients.member_id',
    status: 'agent_clients.status',
    tenantId: 'agent_clients.tenant_id',
  },
  claimDocuments: { __name: 'claim_documents' },
  claimStageHistory: { __name: 'claim_stage_history' },
  claims: { __name: 'claim' },
  db: hoisted.db,
  tenantSettings: {
    category: 'tenant_settings.category',
    key: 'tenant_settings.key',
    tenantId: 'tenant_settings.tenant_id',
  },
}));

vi.mock('@interdomestik/database/claim-number', () => ({
  generateClaimNumber: hoisted.generateClaimNumber,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId: string, tenantColumn: unknown, condition?: unknown) => ({
    condition,
    tenantColumn,
    tenantId,
  })),
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: hoisted.getActiveSubscription,
}));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: hoisted.ensureTenantId }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));
vi.mock('nanoid', () => ({ nanoid: hoisted.nanoid }));
vi.mock('./ai-workflows', () => ({
  queueClaimDocumentAiWorkflows: vi.fn().mockResolvedValue([]),
}));

import { appendEvent } from '@interdomestik/database';
import { createClaimCore } from './create';
import { submitClaimCore } from './submit';

function session() {
  return {
    user: { email: 'member@example.com', id: 'member-1', role: 'member', tenantId: 'tenant-1' },
  };
}

function formData() {
  const data = new FormData();
  data.set('title', 'Retail refund claim');
  data.set('category', 'retail');
  data.set('companyName', 'Retail Co');
  data.set('claimAmount', '120.00');
  return data;
}

describe('claim lifecycle state initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.nanoid.mockReturnValue('claim-1');
    hoisted.getActiveSubscription.mockResolvedValue({ agentId: 'agent-1', branchId: 'branch-1' });
  });

  it('initializes draft claims with deterministic lifecycle states', async () => {
    await createClaimCore({
      formData: formData(),
      requestHeaders: new Headers(),
      session: session(),
    });

    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        caseLifecycleState: 'draft',
        recoveryLifecycleState: 'not_started',
        status: 'draft',
      })
    );
    const claimRow = hoisted.txInsertValues.mock.calls[0]?.[0] as { createdAt?: Date };
    expect(appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ insert: hoisted.txInsert }),
      expect.objectContaining({
        createdAt: claimRow.createdAt,
        entity: { id: 'claim-1', type: 'case' },
        eventName: 'case.created',
        payload: { hasDocuments: false, initialStatus: 'draft' },
        tenantId: 'tenant-1',
      })
    );
  });

  it('initializes submitted claims with deterministic lifecycle states', async () => {
    await submitClaimCore({
      data: {
        category: 'travel',
        claimAmount: '650.00',
        companyName: 'Airline Co',
        currency: 'EUR',
        description: 'The flight was delayed overnight.',
        files: [],
        incidentDate: '2026-02-15',
        title: 'Flight delay claim',
      },
      requestHeaders: new Headers(),
      session: session(),
    });

    expect(hoisted.txInsertValues).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        caseLifecycleState: 'submitted',
        recoveryLifecycleState: 'not_started',
        status: 'submitted',
      })
    );
  });
});
