import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getCore: vi.fn(),
  getDetail: vi.fn(),
  getOptions: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@interdomestik/domain-claims', () => ({ getStaffClaimDetail: mocks.getDetail }));
vi.mock('@/features/staff/claims/assignment-options', () => ({
  getStaffAssignmentOptions: mocks.getOptions,
}));
vi.mock('@/app/[locale]/(staff)/staff/claims/[id]/_core', () => ({
  getStaffClaimDetailsCore: mocks.getCore,
}));
vi.mock('@/components/agent/claim-detail-header', () => ({ ClaimDetailHeader: () => null }));
vi.mock('@/components/agent/claim-documents-pane', () => ({ ClaimDocumentsPane: () => null }));
vi.mock('@/components/agent/claim-info-pane', () => ({ ClaimInfoPane: () => null }));
vi.mock('@/components/messaging/messaging-panel', () => ({ MessagingPanel: () => null }));
vi.mock('@/components/staff/claim-action-panel', () => ({ ClaimActionPanel: () => null }));
vi.mock('@/components/staff/claim-triage-notes', () => ({ ClaimTriageNotes: () => null }));

import { StaffClaimDetailV2Page } from './StaffClaimDetailV2Page';

const authority = mintTestTenantAuthority('tenant-ks');
const session = {
  user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-ks', branchId: 'branch-1' },
};

describe('StaffClaimDetailV2Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ session, authority });
    mocks.getOptions.mockResolvedValue([]);
    mocks.getCore.mockResolvedValue({
      kind: 'ok',
      claim: { id: 'claim-1', staffId: 'staff-1', status: 'submitted' },
      documents: [],
      stageHistory: [],
      slaPhase: 'running',
    });
    mocks.getDetail.mockResolvedValue({
      acceptedRecoveryPrerequisites: {},
      recoveryDecision: {},
      successFeeCollection: null,
      commercialAgreement: null,
    });
  });

  it('reads the commercial detail and options under the session authority itself', async () => {
    await StaffClaimDetailV2Page({ id: 'claim-1', locale: 'en' });

    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
    expect(mocks.getDetail.mock.calls[0]![0].authority).toBe(authority);
    expect(mocks.getDetail.mock.calls[0]![0]).not.toHaveProperty('tenantId');
    expect(mocks.getCore.mock.calls[0]![0].authority).toBe(authority);
    expect(mocks.getOptions.mock.calls[0]![0].authority).toBe(authority);
  });

  it('is not found, and reads nothing, without an authorized staff session', async () => {
    mocks.authorize.mockResolvedValue(null);

    await expect(StaffClaimDetailV2Page({ id: 'claim-1', locale: 'en' })).rejects.toThrow(
      'notFound'
    );
    expect(mocks.getDetail).not.toHaveBeenCalled();
    expect(mocks.getCore).not.toHaveBeenCalled();
  });
});
