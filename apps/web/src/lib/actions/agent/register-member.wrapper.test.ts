import { SalesClosedError } from '@interdomestik/database/pilot-switch';
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
  const conflictTargets: unknown[][] = [];
  const register = (formData = registrationForm()) =>
    registerMemberCore(agent, authority, branchId, formData, sponsored);

  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.length = 0;
    insertedUsers = [{ id: 'new-id' }];
    conflictTargets.length = 0;
    mocks.deletedTables.length = 0;
    mocks.assertNewSalesOpen.mockReset().mockResolvedValue(undefined);
    mocks.issueTenantMemberNumber.mockResolvedValue({ memberNumber: 'MEM-1', isNew: true });
    mocks.selectResults.length = 0;
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);
    mocks.withRetry.mockImplementation(async (operation: () => Promise<unknown>) => operation());
    mocks.tenantTx = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((value: unknown) => {
          insertValues.push(value);
          return {
            onConflictDoNothing: vi.fn((...target: unknown[]) => {
              conflictTargets.push(target);
              return { returning: vi.fn(() => Promise.resolve(insertedUsers)) };
            }),
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
    expect(mocks.assertNewSalesOpen).not.toHaveBeenCalled();
    expect(mocks.withRetry).not.toHaveBeenCalled();
    expect(mocks.emailExecute).not.toHaveBeenCalled();
  });

  it('registers a paused sponsored member with a lowercase email and no credential', async () => {
    const formData = registrationForm(' John.Doe@Example.com ');
    formData.append('password', 'ignored-by-design');

    await expect(register(formData)).resolves.toEqual({ ok: true });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority);
    expect(mocks.assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(mocks.tenantTx as object),
      'tenant-1'
    );
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

  it('uses only the authority tenant and writes nothing when sales are closed', async () => {
    const formData = registrationForm();
    formData.append('tenantId', 'tenant-open');
    mocks.assertNewSalesOpen.mockRejectedValueOnce(new SalesClosedError());

    await expect(register(formData)).resolves.toEqual({ ok: false, code: 'CLOSED' });

    expect(mocks.assertNewSalesOpen).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining(mocks.tenantTx as object),
      'tenant-1'
    );
    expect(insertValues).toEqual([]);
    expect(mocks.deletedTables).toEqual([]);
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
    expect(mocks.emailExecute).not.toHaveBeenCalled();
  });

  it('records a failed switch read and closes before writing', async () => {
    const error = new Error('switch read unavailable');
    mocks.assertNewSalesOpen.mockRejectedValueOnce(error);
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(register()).resolves.toEqual({ ok: false, code: 'CLOSED' });
      expect(report).toHaveBeenCalledExactlyOnceWith(
        'Sponsored registration could not read the sales switch:',
        error
      );
      expect(insertValues).toEqual([]);
      expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
    } finally {
      report.mockRestore();
    }
  });

  it('reports an address that already has an account exactly like a new one, creating nothing', async () => {
    insertedUsers = [];

    await expect(register()).resolves.toEqual({ ok: true });

    expect(insertValues).toHaveLength(1);
    expect(insertValues).not.toContainEqual(expect.objectContaining({ status: 'paused' }));
    expect(mocks.issueTenantMemberNumber).not.toHaveBeenCalled();
    expect(mocks.emailExecute).not.toHaveBeenCalled();
    // No conflict target: the folded-email index arbitrates as well as the stored-email one.
    expect(conflictTargets).toEqual([[]]);
  });

  it('fails validation without a write', async () => {
    await expect(register(registrationForm('invalid-email'))).resolves.toMatchObject({
      ok: false,
      error: 'Validation failed',
    });
    expect(mocks.withRetry).not.toHaveBeenCalled();
  });

  it.each([
    ['user', { userId: 'agent2', role: 'agent' }],
    ['role', { userId: 'agent1', role: 'staff' }],
  ] as const)('refuses the wrong authority %s before checking sales', async (_label, principal) => {
    const other = mintTestTenantAuthority('tenant-1', principal);
    await expect(
      registerMemberCore(agent, other, branchId, registrationForm(), sponsored)
    ).resolves.toEqual(FAILED);
    expect(mocks.withRetry).not.toHaveBeenCalled();
    expect(mocks.assertNewSalesOpen).not.toHaveBeenCalled();
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
