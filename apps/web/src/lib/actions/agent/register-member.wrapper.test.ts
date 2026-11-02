import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMemberCore } from './register-member.core';

const mocks = vi.hoisted(() => ({
  appendTenantMemberCredential: vi.fn(),
  hasTenantMemberCredential: vi.fn(),
  issueTenantMemberNumber: vi.fn(),
  deletedTables: [] as unknown[],
  selectResults: [] as unknown[][],
  withTransactionRetry: vi.fn(),
  withTenantContext: vi.fn(),
  emailExecute: vi.fn(),
}));

vi.mock('@interdomestik/shared-utils/resilience', () => ({
  withTransactionRetry: mocks.withTransactionRetry,
}));

vi.mock('@interdomestik/shared-utils/circuit-breaker', () => ({
  circuitBreakers: {
    email: {
      execute: mocks.emailExecute,
    },
  },
}));

vi.mock('@interdomestik/database', async () => {
  const helper = await import('@/test/canonical-membership-db-mock');

  const db = {
    select: helper.createQueuedSelectMock(mocks.selectResults),
  };

  return {
    agentClients: {
      tenantId: 'agent_clients.tenant_id',
      memberId: 'agent_clients.member_id',
      agentId: 'agent_clients.agent_id',
    },
    and: vi.fn((...conditions: unknown[]) => ({ kind: 'and', conditions })),
    appendTenantMemberCredential: mocks.appendTenantMemberCredential,
    hasTenantMemberCredential: mocks.hasTenantMemberCredential,
    issueTenantMemberNumber: mocks.issueTenantMemberNumber,
    asc: vi.fn((value: unknown) => ({ kind: 'asc', value })),
    eq: vi.fn((column: unknown, value: unknown) => ({ kind: 'eq', column, value })),
    membershipPlans: helper.CANONICAL_MEMBERSHIP_PLAN_COLUMNS,
    db,
    withTenantContext: async (context: unknown, cb: (tx: unknown) => unknown) => {
      mocks.withTenantContext(context);
      return cb(db);
    },
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  user: {},
  account: {},
  agentClients: {},
  subscriptions: {},
}));

vi.mock('@/lib/email', () => ({
  sendMemberWelcomeEmail: vi.fn(),
}));

function registrationForm(email = 'john@example.com'): FormData {
  const formData = new FormData();
  formData.append('fullName', 'John Doe');
  formData.append('email', email);
  formData.append('phone', '1234567890');
  formData.append('password', 'Secret123!');
  formData.append('planId', 'standard');
  return formData;
}

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('new-id'),
  customAlphabet: vi.fn(() => () => 'REFCODE01'),
}));

describe('registerMemberCore', () => {
  const mockAgent = { id: 'agent1', name: 'Agent Smith' };
  const mockTenantId = 'tenant-1';
  const authority = mintTestTenantAuthority(mockTenantId, { userId: 'agent1', role: 'agent' });
  const mockBranchId = 'mk_branch_a';
  const insertValues: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.length = 0;
    mocks.deletedTables.length = 0;
    mocks.appendTenantMemberCredential.mockResolvedValue(true);
    mocks.hasTenantMemberCredential.mockResolvedValue(false);
    mocks.issueTenantMemberNumber.mockResolvedValue({
      memberNumber: 'MEM-2026-000001',
      isNew: true,
    });
    mocks.selectResults.length = 0;
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);
    mocks.withTransactionRetry.mockImplementation(async callback => {
      const tx = {
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((value: unknown) => {
            insertValues.push(value);
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        })),
        // Registration never deletes; any delete is recorded so the tests can prove that.
        delete: vi.fn().mockImplementation((table: unknown) => {
          mocks.deletedTables.push(table);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      };
      return await callback(tx);
    });
    mocks.emailExecute.mockImplementation(async operation => operation());
  });

  it('should register member successfully', async () => {
    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, formData);

    expect(result).toEqual({ ok: true });
    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority);
    expect(mocks.withTransactionRetry).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      { authority }
    );
    // The credential is attached by the kernel append (bcrypt hash only), never by the tenant tx.
    expect(insertValues).not.toContainEqual(expect.objectContaining({ providerId: 'credential' }));
    expect(insertValues).not.toContainEqual(
      expect.objectContaining({ password: expect.anything() })
    );
    expect(mocks.appendTenantMemberCredential).toHaveBeenCalledWith(authority, {
      userId: 'new-id',
      email: 'john@example.com',
      passwordHash: expect.stringMatching(/^\$2[aby]\$10\$/),
    });
    expect(mocks.issueTenantMemberNumber).toHaveBeenCalledWith(authority, {
      userId: 'new-id',
      joinedAt: expect.any(Date),
    });
    expect(mocks.appendTenantMemberCredential.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.issueTenantMemberNumber.mock.invocationCallOrder[0]
    );
    expect(mocks.deletedTables).toEqual([]);
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        role: 'member',
        agentId: 'agent1',
        createdBy: 'agent',
        assistedByAgentId: 'agent1',
      })
    );
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        status: 'active',
        planId: 'standard',
        planKey: 'tenant-standard-plan',
      })
    );
  });

  it('should fail validation', async () => {
    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'invalid-email'); // Invalid email
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Validation failed');
    }
  });

  it('should handle transaction errors (e.g., email duplicate)', async () => {
    mocks.withTransactionRetry.mockRejectedValue(new Error('Duplicate'));

    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, formData);

    expect(result).toEqual({
      ok: false,
      error: 'Failed to register member. Email might already exist.',
    });
  });

  const FAILED = {
    ok: false,
    error: 'Failed to register member. Email might already exist.',
  } as const;

  it('leaves a refused registration in place for recovery and deletes nothing', async () => {
    mocks.appendTenantMemberCredential.mockResolvedValue(false);

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, registrationForm());

    expect(result).toEqual(FAILED);
    expect(mocks.withTransactionRetry).toHaveBeenCalledTimes(1);
    expect(mocks.deletedTables).toEqual([]);
    expect(mocks.hasTenantMemberCredential).not.toHaveBeenCalled();
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
    expect(mocks.emailExecute).not.toHaveBeenCalled();
  });

  it('completes the registration when a thrown append had in fact attached the credential', async () => {
    mocks.appendTenantMemberCredential.mockRejectedValue(new Error('acknowledgement lost'));
    mocks.hasTenantMemberCredential.mockResolvedValue(true);

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, registrationForm());

    expect(result).toEqual({ ok: true });
    expect(mocks.hasTenantMemberCredential).toHaveBeenCalledWith(authority, 'new-id');
    expect(mocks.deletedTables).toEqual([]);
    expect(mocks.issueTenantMemberNumber).toHaveBeenCalledTimes(1);
    expect(mocks.emailExecute).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['reads as absent', () => mocks.hasTenantMemberCredential.mockResolvedValue(false)],
    [
      'cannot be read',
      () => mocks.hasTenantMemberCredential.mockRejectedValue(new Error('still down')),
    ],
  ])(
    'deletes nothing when a thrown append leaves an unknown outcome that %s',
    async (_label, arrange) => {
      mocks.appendTenantMemberCredential.mockRejectedValue(new Error('connection lost'));
      arrange();

      const result = await registerMemberCore(
        mockAgent,
        authority,
        mockBranchId,
        registrationForm()
      );

      expect(result).toEqual(FAILED);
      expect(mocks.withTransactionRetry).toHaveBeenCalledTimes(1);
      expect(mocks.deletedTables).toEqual([]);
      expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
      expect(mocks.emailExecute).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['another agent', mintTestTenantAuthority(mockTenantId, { userId: 'agent2', role: 'agent' })],
    ['a non-agent', mintTestTenantAuthority(mockTenantId, { userId: 'agent1', role: 'staff' })],
    ['no principal', mintTestTenantAuthority(mockTenantId)],
  ])('writes nothing when the authority principal is %s', async (_label, otherAuthority) => {
    const result = await registerMemberCore(
      mockAgent,
      otherAuthority,
      mockBranchId,
      registrationForm()
    );

    expect(result).toEqual(FAILED);
    expect(mocks.withTransactionRetry).not.toHaveBeenCalled();
    expect(mocks.appendTenantMemberCredential).not.toHaveBeenCalled();
  });

  it('keeps a credentialed registration when member-number issuance fails', async () => {
    mocks.issueTenantMemberNumber.mockRejectedValue(new Error('counter unavailable'));

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, registrationForm());

    expect(result).toEqual({ ok: true });
    expect(mocks.deletedTables).toEqual([]);
    expect(mocks.emailExecute).toHaveBeenCalledTimes(1);
  });

  it('creates paused sponsored subscriptions for sponsored imports', async () => {
    const formData = new FormData();
    formData.append('fullName', 'Sponsored User');
    formData.append('email', 'sponsored@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, authority, mockBranchId, formData, {
      membershipMode: 'sponsored',
    });

    expect(result).toEqual({ ok: true });
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        status: 'paused',
        planId: 'standard',
        provider: 'group_sponsor',
        acquisitionSource: 'group_roster_import',
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })
    );
  });
});
