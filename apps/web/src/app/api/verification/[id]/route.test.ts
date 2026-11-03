import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { GET } from './route';

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
