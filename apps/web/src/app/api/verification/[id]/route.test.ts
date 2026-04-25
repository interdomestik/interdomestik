import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  getVerificationRequestDetails: vi.fn(),
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

describe('GET /api/verification/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        userId: 'staff-1',
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
    expect(hoisted.getVerificationRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'staff-1',
        userRole: 'staff',
        scope: expect.objectContaining({ branchId: 'branch-1' }),
      }),
      'payment-attempt-1'
    );
  });
});
