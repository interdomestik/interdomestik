import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEvidenceFile, mockClaimWriterEffects } from './submit-test-support';
import type { ClaimsDeps } from './types';
const h = vi.hoisted(() => {
  const draftClaim = {
    caseLifecycleState: 'draft',
    category: 'vehicle',
    id: 'claim-1',
    recoveryLifecycleState: 'not_started',
    tenantId: 'tenant-1',
    userId: 'member-1',
  };
  const values = vi.fn();
  const returning = vi.fn().mockResolvedValue([{ id: 'claim-1' }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const insert = vi.fn(() => ({ values }));
  return {
    draftClaim,
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
    returning,
    where,
    values,
    set,
  };
});
vi.mock('@interdomestik/database', () => ({
  and: vi.fn((...args: unknown[]) => ({ args })),
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  agentClients: { agentId: 'agent_id', memberId: 'member_id', status: 'status', tenantId: 't' },
  claimDocuments: { __name: 'claim_documents' },
  claimStageHistory: { __name: 'claim_stage_history' },
  claims: {
    __name: 'claim',
    caseLifecycleState: 'claims.case_lifecycle_state',
    id: 'claims.id',
    recoveryLifecycleState: 'claims.recovery_lifecycle_state',
    tenantId: 'claims.tenant_id',
    userId: 'claims.user_id',
  },
  db: h.db,
  withTenantContext: vi.fn(async (_context, callback) => callback(h.db)),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  tenantSettings: { category: 'category', key: 'key', tenantId: 'tenant_id' },
}));
vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLocaleMetadata: vi.fn().mockResolvedValue({ code: 'T1', countryCode: 'MK' }),
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
import { buildClaimStartPublicNote, resolveClaimIncidentCountryUpdate } from './incident-country';
import type { CreateClaimValues } from '../validators/claims';

mockClaimWriterEffects();
const { createClaimCore } = await import('./create');
const { updateDraftClaimCore } = await import('./draft');
const { submitClaimCore } = await import('./submit');

const authority = mintTestTenantAuthority('tenant-1');
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
  data.set('title', 'Vehicle repair claim');
  data.set('category', 'vehicle');
  data.set('companyName', 'Auto Insurer');
  if (countryCode) data.set('incidentCountryCode', countryCode);
  return data;
}

describe('claim incident-country writers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getActiveSubscription.mockResolvedValue({ agentId: 'agent-1', branchId: 'branch-1' });
  });

  it('persists explicit draft creation incident country values', async () => {
    await createClaimCore({
      authority,
      formData: claimForm('de'),
      requestHeaders: new Headers(),
      session,
    });

    expect(h.values).toHaveBeenNthCalledWith(1, expectedIncidentCountry('DE'));
  });

  it('does not promote diaspora handoff context into submitted incident-country authority', async () => {
    await submitClaimCore({
      authority,
      data: claimData(),
      handoffContext: { country: 'IT', incidentLocation: 'abroad', source: 'diaspora-green-card' },
      requestHeaders: new Headers(),
      session,
    });

    expect(h.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ incidentCountryCode: null, incidentJurisdiction: null })
    );
  });

  it('persists explicit submitted incident country ahead of diaspora provenance', async () => {
    await submitClaimCore({
      authority,
      data: claimData({ incidentCountryCode: 'ch' }),
      handoffContext: { country: 'IT', incidentLocation: 'abroad', source: 'diaspora-green-card' },
      requestHeaders: new Headers(),
      session,
    });

    expect(h.values).toHaveBeenNthCalledWith(1, expectedIncidentCountry('CH'));
  });

  it('labels the handoff country as guidance provenance rather than confirmation', () => {
    const note = buildClaimStartPublicNote({
      country: 'IT',
      incidentLocation: 'abroad',
      source: 'diaspora-green-card',
    });
    expect(note).toMatch(/Member-submitted.*guidance: IT; not incident-country authority/);
  });

  it('keeps draft updates nullable for ambiguous country input', async () => {
    await updateDraftClaimCore({
      authority,
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

describe('updateDraftClaimCore category changes', () => {
  function runUpdate(overrides: Partial<CreateClaimValues>, deps?: ClaimsDeps) {
    return updateDraftClaimCore(
      {
        authority,
        claimId: 'claim-1',
        data: claimData(overrides),
        requestHeaders: new Headers(),
        session,
      },
      deps
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    h.db.query.claims.findFirst.mockResolvedValueOnce({
      ...h.draftClaim,
      category: 'Personal Injury',
    });
  });

  it.each(['injury', 'invalidity', 'Personal Injury'])(
    'refuses to edit a draft to category %s',
    async category => {
      await expect(runUpdate({ category })).resolves.toEqual({
        success: false,
        error: 'Validation failed',
      });
      expect(h.db.update).not.toHaveBeenCalled();
      expect(h.db.insert).not.toHaveBeenCalled();
    }
  );

  it('corrects a legacy category while the claim belongs to the member and is still a draft', async () => {
    await expect(runUpdate({ category: ' VEHICLE ' })).resolves.toEqual({ success: true });

    expect(h.set).toHaveBeenCalledWith(expect.objectContaining({ category: 'vehicle' }));
    expect(h.where).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantColumn: 'claims.tenant_id',
      condition: {
        args: [
          { left: 'claims.id', right: 'claim-1' },
          { left: 'claims.user_id', right: 'member-1' },
          { left: 'claims.case_lifecycle_state', right: 'draft' },
          { left: 'claims.recovery_lifecycle_state', right: 'not_started' },
        ],
      },
    });
  });

  it('refuses a stale draft edit before attaching documents or recording success', async () => {
    h.returning.mockResolvedValueOnce([]);
    const deps = {
      validateSubmittedClaimFile: vi.fn().mockResolvedValue(undefined),
      logAuditEvent: vi.fn(),
      revalidatePath: vi.fn(),
    };
    const file = buildEvidenceFile({
      bucket: process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET?.trim() || 'claim-evidence',
    });

    await expect(runUpdate({ category: 'vehicle', files: [file] }, deps)).resolves.toEqual({
      success: false,
      error: 'Claim changed. Refresh and retry.',
      code: 'CONFLICT',
    });

    expect(deps.validateSubmittedClaimFile).toHaveBeenCalledOnce();
    expect(h.db.insert).not.toHaveBeenCalled();
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.revalidatePath).not.toHaveBeenCalled();
  });
});
