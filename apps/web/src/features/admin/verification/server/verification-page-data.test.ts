import {
  ROLE_ADMIN,
  ROLE_BRANCH_MANAGER,
  ROLE_STAFF,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectNoDocumentContent,
  verificationRequest,
} from './branch-manager-redaction.test-fixtures';
import { loadVerificationPageData } from './verification-page-data';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  getVerificationRequestsAction: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));
vi.mock('../actions/verification', () => ({
  getVerificationRequestsAction: mocks.getVerificationRequestsAction,
}));

function authorizeRole(role: string | null) {
  mocks.authorizeSessionTenant.mockResolvedValue({ session: { user: { role } } });
}

describe('D1 verification page-data boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Deliberately return raw rows: this boundary must protect the initial page payload itself.
    mocks.getVerificationRequestsAction.mockResolvedValue({
      success: true,
      data: [verificationRequest],
    });
  });

  it('redacts the initial BM payload even when the action returns raw document fields', async () => {
    authorizeRole(ROLE_BRANCH_MANAGER);

    const result = await loadVerificationPageData(
      Promise.resolve({ view: 'history', query: 'Test' })
    );

    expect(result).toEqual({
      view: 'history',
      query: 'Test',
      viewerRole: ROLE_BRANCH_MANAGER,
      leads: [{ ...verificationRequest, documentId: null, documentPath: null }],
    });
    expectNoDocumentContent(result);
    expect(mocks.getVerificationRequestsAction).toHaveBeenCalledWith({
      view: 'history',
      query: 'Test',
    });
    expect(verificationRequest.documentId).toBe('private-document-1');
  });

  it.each([ROLE_STAFF, ROLE_ADMIN, ROLE_TENANT_ADMIN, ROLE_SUPER_ADMIN])(
    'preserves the %s page payload',
    async role => {
      authorizeRole(role);
      const leads = [verificationRequest];
      mocks.getVerificationRequestsAction.mockResolvedValue({ success: true, data: leads });

      const result = await loadVerificationPageData(Promise.resolve({}));

      expect(result).toEqual({ view: 'queue', query: '', viewerRole: role, leads });
      expect(result.leads).toBe(leads);
    }
  );

  it('preserves an action failure as an empty list', async () => {
    authorizeRole(ROLE_BRANCH_MANAGER);
    mocks.getVerificationRequestsAction.mockResolvedValue({ success: false, error: 'Forbidden' });

    expect((await loadVerificationPageData(Promise.resolve({}))).leads).toEqual([]);
  });

  it('fails closed for a missing role before calling the list action', async () => {
    authorizeRole(null);

    await expect(loadVerificationPageData(Promise.resolve({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.getVerificationRequestsAction).not.toHaveBeenCalled();
  });

  it('fails closed for a missing session before calling the list action', async () => {
    mocks.authorizeSessionTenant.mockResolvedValue(null);

    await expect(loadVerificationPageData(Promise.resolve({}))).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.getVerificationRequestsAction).not.toHaveBeenCalled();
  });
});
