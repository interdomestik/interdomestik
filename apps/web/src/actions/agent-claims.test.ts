import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getHeaders: vi.fn(),
  relayRequest: vi.fn(),
  dbUpdate: vi.fn(),
  dbSelect: vi.fn(),
  txUpdateReturning: vi.fn(),
  txInsertValues: vi.fn(),
  dbQueryUser: vi.fn(),
  dbQueryClaims: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () => mocks.getSession(),
    },
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifyClaimAssigned: vi.fn().mockResolvedValue({ success: true }),
  notifyStatusChanged: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@interdomestik/database', () => ({
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  claims: {
    id: { name: 'id' },
    tenantId: { name: 'tenantId' },
    status: { name: 'status' },
    staffId: { name: 'staffId' },
    userId: { name: 'userId' },
    title: { name: 'title' },
    lifecycleVersion: { name: 'lifecycleVersion' },
  },
  claimStageHistory: {},
  user: { id: { name: 'id' }, tenantId: { name: 'tenantId' }, email: { name: 'email' } },
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => mocks.dbSelect(),
        }),
      }),
    }),
    update: () => ({
      set: () => ({ where: mocks.dbUpdate }),
    }),
    transaction: async <T>(callback: (tx: unknown) => T) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () =>
                // prettier-ignore
                Promise.resolve([{ id: 'claim-1', lifecycleVersion: 1, caseLifecycleState: 'submitted', recoveryLifecycleState: 'not_started', status: 'submitted' }]),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: mocks.txUpdateReturning,
            }),
          }),
        }),
        insert: () => ({
          values: mocks.txInsertValues,
        }),
      }),
    query: {
      user: {
        findFirst: () => mocks.dbQueryUser(),
      },
      claims: {
        findFirst: () => mocks.dbQueryClaims(),
      },
    },
  },
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: mocks.getHeaders,
}));
vi.mock('@/server/operations/m4-assignment-relay-client', () => ({
  relayM4AssignmentRequest: mocks.relayRequest,
}));
import { notifyClaimAssigned } from '@/lib/notifications';
import { assignClaim, updateClaimStatus } from './agent-claims';

describe('Staff Claims Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('updateClaimStatus', () => {
    it.each([
      ['unauthenticated user', null],
      ['regular member', { user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' } }],
      ['sales agent', { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_mk' } }],
    ])('should reject %s status updates', async (_label, session) => {
      mocks.getSession.mockResolvedValue(session);
      await expect(updateClaimStatus('claim-1', 'resolved')).resolves.toEqual({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('should allow staff to update claim status', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant_mk' },
      });
      mocks.dbSelect.mockResolvedValue([
        {
          id: 'claim-1',
          title: 'Test Claim',
          status: 'submitted',
          staffId: 'staff-1',
          userId: 'user-1',
          userEmail: 'user@test.com',
        },
      ]);
      mocks.txUpdateReturning.mockResolvedValue([{ id: 'claim-1', lifecycleVersion: 2 }]);
      mocks.txInsertValues.mockResolvedValue(undefined);

      await updateClaimStatus('claim-1', 'verification');

      expect(mocks.txUpdateReturning).toHaveBeenCalled();
    });

    it('should allow admin to update claim status', async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      });
      mocks.dbSelect.mockResolvedValue([
        {
          id: 'claim-1',
          title: 'Test Claim',
          status: 'submitted',
          userId: 'user-1',
          userEmail: 'user@test.com',
        },
      ]);
      mocks.txUpdateReturning.mockResolvedValue([{ id: 'claim-1', lifecycleVersion: 2 }]);
      mocks.txInsertValues.mockResolvedValue(undefined);

      await updateClaimStatus('claim-1', 'verification');

      expect(mocks.txUpdateReturning).toHaveBeenCalled();
    });
  });

  describe('assignClaim', () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    beforeEach(() => {
      vi.stubEnv('M4_ASSIGNMENT_OWNER_ORIGIN', 'https://assignment.example.test');
      vi.stubEnv('M4_ASSIGNMENT_RELAY_DEADLINE_MS', '12000');
      vi.stubEnv('M4_ASSIGNMENT_OWNER_CA_FILE', undefined);
      mocks.getHeaders.mockResolvedValue(
        new Headers({
          cookie: 'original-cookie',
          'x-forwarded-for': '192.0.2.40',
          'user-agent': 'Agent wrapper unit',
        })
      );
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
      expect(notifyClaimAssigned).not.toHaveBeenCalled();
    }

    it('preserves backend authentication denial without success revalidation', async () => {
      mocks.relayRequest.mockResolvedValue({ status: 'denied', reason: 'UNAUTHORIZED' });
      await expect(assignClaim('claim-1', 'staff-2', operationId)).resolves.toEqual({
        success: false,
        error: 'Unauthorized',
        data: undefined,
      });
      expectOwnedDelegation();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('preserves backend staff self-assignment denial without local mutation', async () => {
      mocks.relayRequest.mockResolvedValue({ status: 'denied', reason: 'SELF_ASSIGNMENT_ONLY' });
      await expect(assignClaim('claim-1', 'staff-2', operationId)).resolves.toEqual({
        success: false,
        error: 'Access denied: Cannot assign other staff',
        data: undefined,
      });
      expectOwnedDelegation();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it('preserves backend missing-claim refusal and performs no success effects', async () => {
      mocks.relayRequest.mockResolvedValue({ status: 'denied', reason: 'RESOURCE_DENIED' });
      await expect(assignClaim('claim-1', 'staff-2', operationId)).resolves.toEqual({
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
      await expect(assignClaim('claim-1', 'staff-2', operationId)).resolves.toEqual({
        success: false,
        error: 'Staff member not found',
      });
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
      await expect(assignClaim('claim-1', 'staff-2', operationId)).resolves.toEqual({
        success: true,
        data: undefined,
      });
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
});
