import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { GET } from './route';
import {
  ROLE_ADMIN,
  ROLE_BRANCH_MANAGER,
  ROLE_STAFF,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import {
  expectNoDocumentContent,
  verificationDetails,
} from '@/features/admin/verification/server/branch-manager-redaction.test-fixtures';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  getVerificationRequestDetails: vi.fn(),
  authorizeSessionTenant: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenant,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/features/admin/verification/server/verification.core', () => ({
  getVerificationRequestDetails: hoisted.getVerificationRequestDetails,
}));

function verificationRequest(): Request {
  return new Request('http://localhost:3000/api/verification/payment-attempt-1');
}

function routeParams(id = 'payment-attempt-1') {
  return { params: Promise.resolve({ id }) };
}

function session(user: {
  id?: string;
  role?: string;
  tenantId?: string | null;
  branchId?: string | null;
}) {
  return {
    user: {
      id: 'staff-1',
      role: 'staff',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      ...user,
    },
  };
}

async function expectJson(response: Response, status: number, body: Record<string, unknown>) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual(body);
}

let issuedAuthority: TenantAuthority | null = null;

describe('GET /api/verification/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issuedAuthority = null;
    // Mirrors the real producer: the authority is minted for the request session's tenant.
    hoisted.authorizeSessionTenant.mockImplementation(async () => {
      const current = await hoisted.getSession();
      const tenantId = current?.user?.tenantId;
      if (!current?.user || !tenantId) return null;
      issuedAuthority = mintTestTenantAuthority(tenantId);
      return { session: current, authority: issuedAuthority };
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 401, { error: 'Unauthorized' });
    expect(hoisted.getVerificationRequestDetails).not.toHaveBeenCalled();
  });

  it('redacts all document content from the BM details JSON, including timeline IDs and names', async () => {
    hoisted.getSession.mockResolvedValue(session({ role: ROLE_BRANCH_MANAGER }));
    hoisted.getVerificationRequestDetails.mockResolvedValue(verificationDetails);

    const response = await GET(verificationRequest(), routeParams());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      id: 'attempt-1',
      documentId: null,
      documentPath: null,
      documents: [],
    });
    expect(payload.timeline).toHaveLength(3);
    expect(payload.timeline[0]).toMatchObject({ type: 'document_upload', title: 'Proof Uploaded' });
    expect(payload.timeline[0]).not.toHaveProperty('description');
    expect(payload.timeline[2]).not.toHaveProperty('description');
    expect(payload.timeline[1].description).toBe('Please confirm payment');
    expectNoDocumentContent(payload);
    expect(hoisted.getVerificationRequestDetails.mock.calls[0][0].userRole).toBe(
      ROLE_BRANCH_MANAGER
    );
    expect(verificationDetails.documents).toHaveLength(2);
  });

  it.each([ROLE_STAFF, ROLE_ADMIN, ROLE_TENANT_ADMIN, ROLE_SUPER_ADMIN])(
    'preserves the complete %s details JSON',
    async role => {
      hoisted.getSession.mockResolvedValue(session({ role }));
      hoisted.getVerificationRequestDetails.mockResolvedValue(verificationDetails);

      const response = await GET(verificationRequest(), routeParams());

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(JSON.stringify(verificationDetails));
    }
  );

  it('returns 401 when the session has no user payload', async () => {
    hoisted.getSession.mockResolvedValue({});

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 401, { error: 'Unauthorized' });
    expect(hoisted.getVerificationRequestDetails).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ''])(
    'returns 401 when tenant identity is missing or malformed (%s)',
    async tenantId => {
      hoisted.getSession.mockResolvedValue(session({ tenantId }));

      const response = await GET(verificationRequest(), routeParams());

      await expectJson(response, 401, { error: 'Missing tenant identity' });
      expect(hoisted.getVerificationRequestDetails).not.toHaveBeenCalled();
    }
  );

  it('returns 403 for roles outside the verification API contract', async () => {
    hoisted.getSession.mockResolvedValue(
      session({ id: 'member-1', role: 'member', tenantId: 'tenant-1', branchId: null })
    );

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 403, { error: 'Forbidden' });
    expect(hoisted.getVerificationRequestDetails).not.toHaveBeenCalled();
  });

  it('returns 404 when scoped verification details are not found', async () => {
    hoisted.getSession.mockResolvedValue(session({}));
    hoisted.getVerificationRequestDetails.mockResolvedValue(null);

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 404, { error: 'Not found' });
    expect(hoisted.getVerificationRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        session: expect.objectContaining({
          user: expect.objectContaining({ id: 'staff-1' }),
        }),
        userRole: 'staff',
        scope: expect.objectContaining({ branchId: 'branch-1' }),
      }),
      'payment-attempt-1'
    );
  });

  it('returns scoped verification details for an authorized staff session', async () => {
    hoisted.getSession.mockResolvedValue(session({}));
    hoisted.getVerificationRequestDetails.mockResolvedValue({
      id: 'payment-attempt-1',
      status: 'pending',
    });

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 200, { id: 'payment-attempt-1', status: 'pending' });
    expect(hoisted.getVerificationRequestDetails.mock.calls[0][0].authority).toBe(issuedAuthority);
    expect(hoisted.getVerificationRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        session: expect.objectContaining({
          user: expect.objectContaining({ id: 'staff-1' }),
        }),
        userRole: 'staff',
        scope: expect.objectContaining({ branchId: 'branch-1' }),
      }),
      'payment-attempt-1'
    );
  });

  it('returns 401 when the session authority names a different tenant than the boundary', async () => {
    hoisted.getSession.mockResolvedValue(session({}));
    hoisted.authorizeSessionTenant.mockResolvedValueOnce({
      session: session({}),
      authority: mintTestTenantAuthority('tenant-other'),
    });

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 401, { error: 'Unauthorized' });
    expect(hoisted.getVerificationRequestDetails).not.toHaveBeenCalled();
  });

  it('returns 401 when the session authority belongs to a different user', async () => {
    hoisted.getSession.mockResolvedValue(session({}));
    hoisted.authorizeSessionTenant.mockResolvedValueOnce({
      session: session({ id: 'staff-2' }),
      authority: mintTestTenantAuthority('tenant-1'),
    });

    const response = await GET(verificationRequest(), routeParams());

    await expectJson(response, 401, { error: 'Unauthorized' });
    expect(hoisted.getVerificationRequestDetails).not.toHaveBeenCalled();
  });
});
