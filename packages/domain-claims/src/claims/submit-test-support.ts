import { vi, type Mock } from 'vitest';
import type { CreateClaimValues } from '../validators/claims';
import type { ClaimStartHandoffContext, ClaimsSession } from './types';

export type SubmitClaimTestArgs = {
  session: ClaimsSession;
  requestHeaders: Headers;
  handoffContext?: ClaimStartHandoffContext | null;
  hostId?: string | null;
  trustedClaimId?: string;
  data: CreateClaimValues;
};

export const appendEventMock: Mock = vi.fn();
export const ensureTenantIdMock = vi.fn(() => 'tenant-1');
export const generateClaimNumberMock: Mock = vi.fn();
export const getActiveSubscriptionMock: Mock = vi.fn();
export const logAuditEventMock: Mock = vi.fn();
export const nanoidMock: Mock = vi.fn();
export const queueClaimDocumentAiWorkflowsMock: Mock = vi.fn();
export const readTenantLocaleMetadataMock: Mock = vi.fn();

export const txInsertValues: Mock = vi.fn();
export const txInsert: Mock = vi.fn(() => ({ values: txInsertValues }));
export const txQuery: Record<'agentClients' | 'tenantSettings' | 'user', { findFirst: Mock }> = {
  agentClients: { findFirst: vi.fn() },
  tenantSettings: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
};
export const submitTx: { insert: Mock; query: typeof txQuery; transaction: Mock } = {
  insert: txInsert,
  query: txQuery,
  transaction: vi.fn(),
};

export const tenantContextOrder: string[] = [];
export const tenantContexts: unknown[] = [];
let openContexts = 0;

export const withTenantContextMock = vi.fn(
  async (context: unknown, action: (tx: typeof submitTx) => Promise<unknown>) => {
    if (openContexts > 0) {
      throw new Error('nested tenant context transaction is forbidden');
    }
    openContexts += 1;
    tenantContexts.push(context);
    tenantContextOrder.push('context:open');
    try {
      return await action(submitTx);
    } finally {
      openContexts -= 1;
      tenantContextOrder.push('context:close');
    }
  }
);

// Sentinel: any unscoped client access in the submission path must fail the test.
export const unscopedDbSentinel = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property === 'symbol') return undefined;
      throw new Error(`unscoped db access is forbidden: db.${property}`);
    },
  }
);

export const databaseModuleMock = (): Record<string, unknown> => ({
  appendEvent: appendEventMock,
  agentClients: {
    tenantId: 'agent_clients.tenant_id',
    memberId: 'agent_clients.member_id',
    agentId: 'agent_clients.agent_id',
    status: 'agent_clients.status',
  },
  claimDocuments: { __name: 'claim_documents' },
  claimStageHistory: { __name: 'claim_stage_history' },
  claims: { __name: 'claim' },
  db: unscopedDbSentinel,
  tenantSettings: {
    tenantId: 'tenant_settings.tenant_id',
    category: 'tenant_settings.category',
    key: 'tenant_settings.key',
  },
  withTenantContext: withTenantContextMock,
});

export const tenantSecurityModuleMock = () => ({
  withTenant: vi.fn((tenantId: string, tenantColumn: unknown, condition?: unknown) => ({
    __op: 'withTenant',
    tenantId,
    tenantColumn,
    condition,
  })),
});

export const drizzleModuleMock = () => ({
  and: vi.fn((...args: unknown[]) => ({ __op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ __op: 'eq', left, right })),
});

export function resetSubmitClaimMocks(): void {
  vi.clearAllMocks();
  openContexts = 0;
  tenantContextOrder.length = 0;
  tenantContexts.length = 0;
  appendEventMock.mockResolvedValue({ id: 'event-1' });
  generateClaimNumberMock.mockResolvedValue('CLM-T1-2026-000001');
  logAuditEventMock.mockResolvedValue(undefined);
  nanoidMock.mockReturnValueOnce('claim-1').mockReturnValueOnce('legacy-doc-1');
  queueClaimDocumentAiWorkflowsMock.mockResolvedValue([
    {
      runId: 'run-1',
      workflow: 'claim_intake_extract',
      claimId: 'claim-1',
      documentId: 'legacy-doc-1',
    },
  ]);
  readTenantLocaleMetadataMock.mockResolvedValue({ code: 'T1', countryCode: 'XK' });
  txInsertValues.mockResolvedValue(undefined);
  txQuery.agentClients.findFirst.mockResolvedValue(null);
  txQuery.tenantSettings.findFirst.mockResolvedValue(null);
  txQuery.user.findFirst.mockResolvedValue(null);
  getActiveSubscriptionMock.mockResolvedValue({ branchId: 'branch-1', agentId: 'agent-1' });
}

type SubmitClaimFile = NonNullable<CreateClaimValues['files']>[number];

export function buildEvidenceFile(overrides: Partial<SubmitClaimFile> = {}): SubmitClaimFile {
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

export function buildEvidenceFiles(count: number): SubmitClaimFile[] {
  return Array.from({ length: count }, (_, index) =>
    buildEvidenceFile({
      id: `upload-${index}`,
      name: `evidence-${index}.pdf`,
      path: `pii/tenants/tenant-1/claims/member-1/unassigned/upload-${index}-evidence.pdf`,
    })
  );
}

export function buildSubmitArgs(
  overrides: {
    files?: SubmitClaimFile[];
    handoffContext?: ClaimStartHandoffContext | null;
    hostId?: string | null;
  } = {}
): SubmitClaimTestArgs {
  return {
    session: {
      user: { id: 'member-1', role: 'member', tenantId: 'tenant-1', email: 'member@example.com' },
    },
    requestHeaders: new Headers(),
    handoffContext: overrides.handoffContext,
    hostId: overrides.hostId,
    data: {
      title: 'Delay',
      description: 'Delayed overnight costs.',
      category: 'travel',
      companyName: 'Airline Co',
      claimAmount: '650.00',
      currency: 'EUR',
      incidentDate: '2026-02-15',
      files: overrides.files ?? [buildEvidenceFile()],
    },
  };
}
