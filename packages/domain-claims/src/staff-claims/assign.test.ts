import { auditLog, claims, user, type TenantTransaction } from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeClaimAssignment } from './assign';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));

const runTransaction = vi.mocked(withTenantAuthority);
const pg = new PgDialect();
const currentClaim = {
  ...claimLifecycleFieldsForStatus('submitted'),
  id: 'claim',
  staffId: null as string | null,
  assignedAt: null,
  assignedById: null,
  claimNumber: 'C-1',
};

function authority(role: string) {
  return mintTestTenantAuthority('tenant-1', { role, userId: 'actor' });
}

function useTransaction(
  options: {
    claim?: typeof currentClaim | null;
    target?: string | null;
    conflict?: boolean;
    failsAudit?: boolean;
  } = {}
) {
  const effects: string[] = [];
  const select = vi.fn(() => ({
    from: (table: unknown) => ({
      where: (where: Parameters<typeof pg.sqlToQuery>[0]) => ({
        for: (strength: string) => {
          effects.push(strength);
          expect(pg.sqlToQuery(where).params).toContain('tenant-1');
          if (table === claims) {
            const result = options.claim === undefined ? currentClaim : options.claim;
            return Promise.resolve(result ? [result] : []);
          }
          expect(table).toBe(user);
          expect(pg.sqlToQuery(where).params).toContain('staff');
          return Promise.resolve(
            options.target === null ? [] : [{ id: options.target ?? 'assignee' }]
          );
        },
      }),
    }),
  }));
  const writes = vi.fn((fields: Record<string, unknown>) => fields);
  const guard = vi.fn();
  const audits = vi.fn(() => {
    effects.push('audit');
    if (options.failsAudit) return Promise.reject(new Error('Audit insert failed'));
    return Promise.resolve();
  });
  const tx = {
    select,
    update: vi.fn(() => ({
      set: (fields: Record<string, unknown>) => ({
        where: (where: Parameters<typeof pg.sqlToQuery>[0]) => ({
          returning: () => {
            guard(pg.sqlToQuery(where));
            effects.push('write');
            return Promise.resolve(options.conflict ? [] : [{ id: 'claim', ...writes(fields) }]);
          },
        }),
      }),
    })),
    insert: vi.fn((table: unknown) => {
      expect(table).toBe(auditLog);
      return { values: audits };
    }),
  };
  let commits = 0;
  runTransaction.mockImplementation(async (_authority, execute) => {
    const result = await execute(tx as unknown as TenantTransaction);
    commits++;
    return result;
  });
  return { effects, select, writes, audits, guard, commits: () => commits };
}

beforeEach(() => vi.resetAllMocks());

describe('changeClaimAssignment', () => {
  it.each(['user', 'member', 'agent', 'branch_manager', 'auditor', 'global_support', ''])(
    'refuses %s before reading a claim',
    async role => {
      await expect(
        changeClaimAssignment(authority(role), { claimId: 'claim', staffId: null })
      ).resolves.toEqual({ ok: false, code: 'forbidden_role' });
      expect(runTransaction).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'applies the admin matrix to %s',
    async role => {
      const denySelf = await changeClaimAssignment(authority(role), {
        claimId: 'claim',
        staffId: 'actor',
      });
      expect(denySelf).toEqual({ ok: false, code: 'target_denied' });
      expect(runTransaction).not.toHaveBeenCalled();

      const draft = {
        ...currentClaim,
        ...claimLifecycleFieldsForStatus('draft'),
        staffId: 'assignee',
      };
      const tx = useTransaction({ claim: draft });
      await expect(
        changeClaimAssignment(authority(role), { claimId: 'claim', staffId: 'assignee' })
      ).resolves.toEqual({ ok: false, code: 'draft' });
      expect(tx.effects).toEqual(['no key update']);

      await expect(
        changeClaimAssignment(authority(role), { claimId: 'claim', staffId: null })
      ).resolves.toMatchObject({ ok: true, changed: true, assignment: { staffId: null } });
      expect(tx.audits).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'unassign_owner',
          actorRole: role,
          metadata: { previousStaffId: 'assignee', claimNumber: 'C-1' },
        })
      );

      useTransaction({ claim: { ...currentClaim, ...claimLifecycleFieldsForStatus('rejected') } });
      await expect(
        changeClaimAssignment(authority(role), { claimId: 'claim', staffId: null })
      ).resolves.toEqual({ ok: false, code: 'terminal' });
    }
  );

  it('lets staff default to self on a terminal claim and locks claim then target', async () => {
    const tx = useTransaction({
      claim: { ...currentClaim, ...claimLifecycleFieldsForStatus('resolved') },
      target: 'actor',
    });
    const headers = new Headers({
      'x-forwarded-for': '192.0.2.2, 192.0.2.1',
      'user-agent': 'test',
    });
    await expect(
      changeClaimAssignment(authority('staff'), { claimId: 'claim' }, { requestHeaders: headers })
    ).resolves.toMatchObject({ ok: true, changed: true, assignment: { staffId: 'actor' } });
    expect(tx.effects).toEqual(['no key update', 'share', 'write', 'audit']);
    expect(tx.guard).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringMatching(
          /"staffId" is null.*"case_lifecycle_state".*"recovery_lifecycle_state"/
        ),
      })
    );
    expect(tx.audits).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.assigned',
        actorId: 'actor',
        metadata: {
          previousStaffId: null,
          newStaffId: 'actor',
          ip: '192.0.2.2',
          userAgent: 'test',
        },
      })
    );
  });

  it('returns the same denial for a missing or out-of-scope claim', async () => {
    const tx = useTransaction({ claim: null });
    await expect(changeClaimAssignment(authority('staff'), { claimId: 'claim' })).resolves.toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(tx.effects).toEqual(['no key update']);
  });

  it('declines a target that the locked user check cannot see', async () => {
    const tx = useTransaction({ target: null });
    await expect(
      changeClaimAssignment(authority('staff'), { claimId: 'claim', staffId: 'out-of-scope' })
    ).resolves.toEqual({ ok: false, code: 'target_denied' });
    expect(tx.effects).toEqual(['no key update', 'share']);
  });

  it('keeps an unchanged staff assignment audit-free', async () => {
    const tx = useTransaction({ claim: { ...currentClaim, staffId: 'assignee' } });
    await expect(
      changeClaimAssignment(authority('staff'), { claimId: 'claim', staffId: 'assignee' })
    ).resolves.toMatchObject({ ok: true, changed: false });
    expect(tx.effects).toEqual(['no key update']);
  });

  it('refreshes a repeated admin assignment after locking the staff target and audits the write', async () => {
    const tx = useTransaction({ claim: { ...currentClaim, staffId: 'assignee' } });
    await expect(
      changeClaimAssignment(authority('admin'), { claimId: 'claim', staffId: 'assignee' })
    ).resolves.toMatchObject({
      ok: true,
      changed: true,
      assignment: { staffId: 'assignee', assignedById: 'actor', assignedAt: expect.any(Date) },
    });
    expect(tx.effects).toEqual(['no key update', 'share', 'write', 'audit']);
    expect(tx.audits).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'assign_owner',
        actorId: 'actor',
        metadata: { previousStaffId: 'assignee', newStaffId: 'assignee', claimNumber: 'C-1' },
      })
    );
  });

  it('rejects a repeated admin assignment when the assignee no longer qualifies', async () => {
    const tx = useTransaction({ claim: { ...currentClaim, staffId: 'assignee' }, target: null });
    await expect(
      changeClaimAssignment(authority('admin'), { claimId: 'claim', staffId: 'assignee' })
    ).resolves.toEqual({ ok: false, code: 'target_denied' });
    expect(tx.effects).toEqual(['no key update', 'share']);
  });

  it.each(['staff', 'admin'])(
    'keeps an already-clear unassignment audit-free for %s',
    async role => {
      const tx = useTransaction();
      await expect(
        changeClaimAssignment(authority(role), { claimId: 'claim', staffId: null })
      ).resolves.toMatchObject({ ok: true, changed: false });
      expect(tx.effects).toEqual(['no key update']);
    }
  );

  it('rolls back and leaves the audit untouched on a lifecycle or owner CAS miss', async () => {
    const tx = useTransaction({ conflict: true });
    await expect(
      changeClaimAssignment(authority('admin'), { claimId: 'claim', staffId: 'assignee' })
    ).resolves.toEqual({ ok: false, code: 'conflict' });
    expect(tx.effects).toEqual(['no key update', 'share', 'write']);
    expect(tx.commits()).toBe(0);
  });

  it('rolls back an assignment whose audit insert failed', async () => {
    const tx = useTransaction({ failsAudit: true });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(
        changeClaimAssignment(authority('admin'), { claimId: 'claim', staffId: 'assignee' })
      ).resolves.toEqual({ ok: false, code: 'transaction_failed' });
      expect(tx.effects).toEqual(['no key update', 'share', 'write', 'audit']);
      expect(tx.commits()).toBe(0);
      expect(log).toHaveBeenCalledWith('Claim assignment transaction failed', expect.any(Error));
    } finally {
      log.mockRestore();
    }
  });
});
