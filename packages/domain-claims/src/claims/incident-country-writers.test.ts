import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => {
  const draftClaim = { id: 'claim-1', status: 'draft', tenantId: 'tenant-1', userId: 'member-1' };
  const values = vi.fn();
  const where = vi.fn();
  const set = vi.fn(() => ({ where }));
  const insert = vi.fn(() => ({ values }));
  return {
    db: {
      query: {
        agentClients: { findFirst: vi.fn().mockResolvedValue(null) },
        claims: { findFirst: vi.fn().mockResolvedValue(draftClaim) },
        tenantSettings: { findFirst: vi.fn().mockResolvedValue(null) },
        user: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert,
      transaction: vi.fn(async (callback: (tx: { insert: typeof insert }) => Promise<void>) =>
        callback({ insert })
      ),
      update: vi.fn(() => ({ set })),
    },
    getActiveSubscription: vi.fn().mockResolvedValue({ agentId: 'agent-1', branchId: 'branch-1' }),
    values,
    set,
  };
});
vi.mock('@interdomestik/database', () => ({
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  agentClients: { agentId: 'agent_id', memberId: 'member_id', status: 'status', tenantId: 't' },
  claimDocuments: { __name: 'claim_documents' },
  claimStageHistory: { __name: 'claim_stage_history' },
  claims: { __name: 'claim', id: 'claims.id', tenantId: 'claims.tenant_id' },
  db: h.db,
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  tenantSettings: { category: 'category', key: 'key', tenantId: 'tenant_id' },
}));
vi.mock('@interdomestik/database/claim-number', () => ({
  generateClaimNumber: vi.fn().mockResolvedValue('CLM-T1-2026-000001'),
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId: string, tenantColumn: unknown, condition?: unknown) => ({
    condition,
    tenantColumn,
    tenantId,
  })),
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: h.getActiveSubscription,
}));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: vi.fn(() => 'tenant-1') }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));
vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'claim-1') }));
vi.mock('./ai-workflows', () => ({ queueClaimDocumentAiWorkflows: vi.fn().mockResolvedValue([]) }));
import { createClaimCore } from './create';
import { updateDraftClaimCore } from './draft';
import { resolveClaimIncidentCountryUpdate } from './incident-country';
import { submitClaimCore } from './submit';
import type { CreateClaimValues } from '../validators/claims';

const session = {
  user: { email: 'm@example.test', id: 'member-1', role: 'member', tenantId: 'tenant-1' },
};

function claimData(overrides: Partial<CreateClaimValues> = {}): CreateClaimValues {
  return {
    category: 'travel',
    companyName: 'Airline Co',
    currency: 'EUR',
    description: 'The flight was delayed overnight.',
    files: [],
    title: 'Flight delay claim',
    ...overrides,
  };
}

function claimForm(countryCode?: string) {
  const data = new FormData();
  data.set('title', 'Retail refund claim');
  data.set('category', 'retail');
  data.set('companyName', 'Retail Co');
  if (countryCode) data.set('incidentCountryCode', countryCode);
  return data;
}

describe('claim incident-country writers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getActiveSubscription.mockResolvedValue({ agentId: 'agent-1', branchId: 'branch-1' });
  });

  it('persists explicit draft creation incident country values', async () => {
    await createClaimCore({ formData: claimForm('de'), requestHeaders: new Headers(), session });

    expect(h.values).toHaveBeenNthCalledWith(1, expectedIncidentCountry('DE'));
  });

  it('persists diaspora handoff country on submitted claims', async () => {
    await submitClaimCore({
      data: claimData(),
      handoffContext: { country: 'IT', incidentLocation: 'abroad', source: 'diaspora-green-card' },
      requestHeaders: new Headers(),
      session,
    });

    expect(h.values).toHaveBeenNthCalledWith(1, expectedIncidentCountry('IT'));
  });

  it('persists explicit submitted claim incident country without diaspora handoff', async () => {
    await submitClaimCore({
      data: claimData({ incidentCountryCode: 'ch' }),
      requestHeaders: new Headers(),
      session,
    });

    expect(h.values).toHaveBeenNthCalledWith(1, expectedIncidentCountry('CH'));
  });

  it('keeps draft updates nullable for ambiguous country input', async () => {
    await updateDraftClaimCore({
      claimId: 'claim-1',
      data: claimData({ incidentCountryCode: 'Germany' }),
      requestHeaders: new Headers(),
      session,
    });

    expect(h.set).toHaveBeenCalledWith(
      expect.objectContaining({ incidentCountryCode: null, incidentJurisdiction: null })
    );
    expect(resolveClaimIncidentCountryUpdate({ incidentJurisdiction: 'country:DE' })).toEqual({});
  });
});
const expectedIncidentCountry = (countryCode: string) =>
  expect.objectContaining({
    incidentCountryCode: countryCode,
    incidentJurisdiction: `country:${countryCode}`,
  });
