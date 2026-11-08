import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mocks, registrationForm } from './register-member.wrapper.test-support';
import { DIRECT_REGISTRATION_RETIRED, registerMemberCore } from './register-member.core';

const FAILED = { ok: false, error: 'Failed to register member.' };

describe('registerMemberCore', () => {
  const agent = { id: 'agent1', name: 'Agent Smith' };
  const authority = mintTestTenantAuthority('tenant-1', { userId: 'agent1', role: 'agent' });
  const branchId = 'mk_branch_a';
  const sponsored = { membershipMode: 'sponsored' } as const;
  const insertValues: unknown[] = [];
  let insertedUsers: unknown[] = [];
  const register = (formData = registrationForm()) =>
    registerMemberCore(agent, authority, branchId, formData, sponsored);

  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.length = 0;
    insertedUsers = [{ id: 'new-id' }];
    mocks.deletedTables.length = 0;
    mocks.issueTenantMemberNumber.mockResolvedValue({ memberNumber: 'MEM-1', isNew: true });
    mocks.selectResults.length = 0;
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);
    mocks.withRetry.mockImplementation(async (operation: () => Promise<unknown>) => operation());
    mocks.tenantTx = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((value: unknown) => {
          insertValues.push(value);
          return {
            onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => insertedUsers) })),
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          };
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn().mockImplementation((table: unknown) => {
        mocks.deletedTables.push(table);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    };
    mocks.emailExecute.mockImplementation(async operation => operation());
  });

  it.each([
    ['omitted mode', undefined],
    ['direct mode', { membershipMode: 'direct' } as const],
  ])('refuses %s before any read or write (ACQ-2, D1 a)', async (_label, options) => {
    await expect(
      registerMemberCore(agent, authority, branchId, registrationForm(), options)
    ).resolves.toMatchObject({ ok: false, code: DIRECT_REGISTRATION_RETIRED });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.withRetry).not.toHaveBeenCalled();
    expect(mocks.emailExecute).not.toHaveBeenCalled();
  });

  it('registers a paused sponsored member with a lowercase email and no credential', async () => {
    const formData = registrationForm(' John.Doe@Example.com ');
    formData.append('password', 'ignored-by-design');

    await expect(register(formData)).resolves.toEqual({ ok: true });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority);
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        role: 'member',
        email: 'john.doe@example.com',
        emailVerified: false,
        agentId: 'agent1',
        createdBy: 'agent',
        assistedByAgentId: 'agent1',
      })
    );
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        status: 'paused',
        provider: 'group_sponsor',
        acquisitionSource: 'group_roster_import',
        currentPeriodStart: null,
      })
    );
    for (const value of insertValues) {
      expect(value).not.toHaveProperty('password');
      expect(value).not.toHaveProperty('providerId');
    }
    expect(mocks.issueTenantMemberNumber).toHaveBeenCalledWith(authority, {
      userId: 'new-id',
      joinedAt: expect.any(Date),
    });
    expect(mocks.deletedTables).toEqual([]);
    expect(mocks.emailExecute).not.toHaveBeenCalled();
  });

  it('reports an address that already has an account exactly like a new one, creating nothing', async () => {
    insertedUsers = [];

    await expect(register()).resolves.toEqual({ ok: true });

    expect(insertValues).toHaveLength(1);
    expect(insertValues).not.toContainEqual(expect.objectContaining({ status: 'paused' }));
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
    expect(mocks.emailExecute).not.toHaveBeenCalled();
  });

  it('fails validation without a write', async () => {
    await expect(register(registrationForm('invalid-email'))).resolves.toMatchObject({
      ok: false,
      error: 'Validation failed',
    });
    expect(mocks.withRetry).not.toHaveBeenCalled();
  });

  it('refuses an agent that is not the authority principal', async () => {
    const other = mintTestTenantAuthority('tenant-1', { userId: 'agent2', role: 'agent' });
    await expect(
      registerMemberCore(agent, other, branchId, registrationForm(), sponsored)
    ).resolves.toEqual(FAILED);
    expect(mocks.withRetry).not.toHaveBeenCalled();
  });

  it('reports a failed transaction without detail', async () => {
    mocks.withRetry.mockRejectedValue(new Error('Duplicate'));
    await expect(register()).resolves.toEqual(FAILED);
  });

  it('keeps the registration when member-number issuance fails', async () => {
    mocks.issueTenantMemberNumber.mockRejectedValue(new Error('sequence unavailable'));
    await expect(register()).resolves.toEqual({ ok: true });
    expect(mocks.deletedTables).toEqual([]);
  });
});
