import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  relayRequest: vi.fn(),
  dbUpdate: vi.fn(),
  dbQueryUser: vi.fn(),
  dbQueryClaims: vi.fn(),
  notifyClaimAssigned: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: () => mocks.getSession() } } }));
vi.mock('@/lib/notifications', () => ({ notifyClaimAssigned: mocks.notifyClaimAssigned }));
vi.mock('@interdomestik/database', () => ({
  db: {
    update: () => ({ set: () => ({ where: mocks.dbUpdate }) }),
    query: {
      user: { findFirst: () => mocks.dbQueryUser() },
      claims: { findFirst: () => mocks.dbQueryClaims() },
    },
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/operations/m4-assignment-relay-client', () => ({
  relayM4AssignmentRequest: mocks.relayRequest,
}));
import { executeM4QualificationAgentAssignment } from './m4-qualification-agent-assignment';

describe('M4 qualification agent assignment relay adapter', () => {
  const operationId = '11111111-1111-4111-8111-111111111111';
  const requestHeaders = new Headers({
    cookie: 'original-cookie',
    'x-forwarded-for': '192.0.2.40',
    'user-agent': 'Agent wrapper unit',
  });
  const assign = () =>
    executeM4QualificationAgentAssignment({
      claimId: 'claim-1',
      staffId: 'staff-2',
      requestHeaders,
      operationId,
    });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('M4_ASSIGNMENT_OWNER_ORIGIN', 'https://assignment.example.test');
    vi.stubEnv('M4_ASSIGNMENT_RELAY_DEADLINE_MS', '12000');
    vi.stubEnv('M4_ASSIGNMENT_OWNER_CA_FILE', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  function expectOwnedDelegation() {
    expect(mocks.relayRequest).toHaveBeenCalledExactlyOnceWith(
      { origin: 'https://assignment.example.test', deadlineMs: 12000 },
      'legacy-agent',
      'original-cookie',
      JSON.stringify({
        version: 1,
        command: 'm4.legacy.assign-claim',
        operationId,
        claimId: 'claim-1',
        staffId: 'staff-2',
      }),
      JSON.stringify({ ip: '192.0.2.40', userAgent: 'Agent wrapper unit' })
    );
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.dbQueryClaims).not.toHaveBeenCalled();
    expect(mocks.dbQueryUser).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.notifyClaimAssigned).not.toHaveBeenCalled();
  }

  it('preserves backend authentication denial without success revalidation', async () => {
    mocks.relayRequest.mockResolvedValue({ status: 'denied', reason: 'UNAUTHORIZED' });
    await expect(assign()).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
      data: undefined,
    });
    expectOwnedDelegation();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('preserves backend staff self-assignment denial without local mutation', async () => {
    mocks.relayRequest.mockResolvedValue({ status: 'denied', reason: 'SELF_ASSIGNMENT_ONLY' });
    await expect(assign()).resolves.toEqual({
      success: false,
      error: 'Access denied: Cannot assign other staff',
      data: undefined,
    });
    expectOwnedDelegation();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('preserves backend missing-claim refusal and performs no success effects', async () => {
    mocks.relayRequest.mockResolvedValue({ status: 'denied', reason: 'RESOURCE_DENIED' });
    await expect(assign()).resolves.toEqual({
      success: false,
      error: 'Claim not found',
      data: undefined,
    });
    expectOwnedDelegation();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('preserves completed staff eligibility failure without cache success', async () => {
    mocks.relayRequest.mockResolvedValue({
      status: 'completed',
      operationId,
      result: { success: false, error: 'Staff member not found' },
    });
    await expect(assign()).resolves.toEqual({ success: false, error: 'Staff member not found' });
    expectOwnedDelegation();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('delegates mutation and notification to the owner and revalidates completed success', async () => {
    // Actual mutation/audit/notification assertions live in the restricted-owner SQL cases.
    mocks.relayRequest.mockResolvedValue({
      status: 'completed',
      operationId,
      result: { success: true, data: undefined },
      changed: true,
    });
    await expect(assign()).resolves.toEqual({ success: true, data: undefined });
    expectOwnedDelegation();
    const paths = [
      '/member/claims',
      '/member/claims/claim-1',
      '/admin/claims',
      '/admin/claims/claim-1',
      '/staff/claims',
      '/staff/claims/claim-1',
    ];
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(
      paths.flatMap(path => ['sq', 'en', 'sr', 'mk'].map(locale => ['/' + locale + path]))
    );
  });
});
