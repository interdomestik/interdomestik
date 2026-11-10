import type { TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuardedBranchCore, updateGuardedBranchCore } from './branch-guarded-writes';
import { branch, fixture, tenantId } from './branch-writes.test-support';

vi.mock('@interdomestik/database', async () => ({
  ...(await import('@interdomestik/database/schema')),
  ...(await import('drizzle-orm')),
  delegateSuperAdminTenant: vi.fn(),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));

const session = { user: { id: 'admin-1', role: 'admin', tenantId } };
const authority = mintTestTenantAuthority(tenantId, { userId: session.user.id, role: 'admin' });
const writers = [
  { mode: 'create', write: createGuardedBranchCore, action: 'branch.created' },
  { mode: 'update', write: updateGuardedBranchCore, action: 'branch.updated' },
] as const;

describe.each(writers)('guarded $mode entry point', ({ mode, write, action }) => {
  let f: ReturnType<typeof fixture>;
  const audit = vi.fn();
  const params = { session, authority, branchId: 'target', name: ' Second ', code: 'KS' };

  beforeEach(() => {
    vi.clearAllMocks();
    f = fixture([branch('target', false)]);
    vi.mocked(withTenantAuthority).mockImplementation(
      async <T>(_authority: TenantAuthority, work: (tx: TenantTransaction) => Promise<T>) => {
        f.events.push('begin');
        const result = await work(f.tx);
        f.events.push('commit');
        return result;
      }
    );
    audit.mockImplementation(() => {
      f.events.push('audit');
    });
  });

  it('requires a session, branches.manage and authority belonging to the session user', async () => {
    await expect(write({ ...params, session: null }, { logAuditEvent: audit })).rejects.toThrow(
      'Unauthorized'
    );
    await expect(
      write({ ...params, session: { user: { ...session.user, role: 'staff' } } })
    ).rejects.toThrow('Permission denied: branches.manage');
    for (const invalid of [null, mintTestTenantAuthority(tenantId, { userId: 'other' })]) {
      await expect(write({ ...params, authority: invalid })).rejects.toThrow('Unauthorized');
    }
    expect(withTenantAuthority).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('preserves name validation before opening a write transaction', async () => {
    expect(await write({ ...params, name: '  ' })).toEqual({ error: 'Branch name is required' });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('retains the operation-specific empty-slug validation', async () => {
    expect(await write({ ...params, name: '!!!' })).toEqual(
      mode === 'create' ? { error: 'Invalid name generates empty slug' } : { success: true }
    );
    expect(withTenantAuthority).toHaveBeenCalledTimes(mode === 'create' ? 0 : 1);
  });

  it.each(['slug', 'code'] as const)(
    'preserves %s duplicate errors without writes or audits',
    async field => {
      f.rows.push({ ...branch('duplicate', false), [field]: field === 'slug' ? 'second' : 'KS' });
      expect(await write(params, { logAuditEvent: audit })).toEqual({
        error:
          field === 'slug'
            ? 'Branch with this name (slug) already exists'
            : 'Branch with this code already exists',
      });
      expect(withTenantAuthority).toHaveBeenCalledTimes(1);
      expect(f.values).not.toHaveBeenCalled();
      expect(f.update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    }
  );

  it('returns the policy error without writing or auditing', async () => {
    f.rows.push(branch('active'));
    expect(await write(params, { logAuditEvent: audit })).toEqual({
      error: 'Only one active branch is allowed for this tenant.',
      code: 'single_branch_limit',
    });
    expect(withTenantAuthority).toHaveBeenCalledExactlyOnceWith(authority, expect.any(Function));
    expect(f.events).toEqual(['begin', 'lock', 'setting', 'active', 'commit']);
    expect(f.values).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('locks, checks policy and writes inside one tenant transaction, then audits once', async () => {
    const result = await write(params, { logAuditEvent: audit });
    expect(result).toEqual(
      mode === 'create'
        ? { success: true, data: { branchId: expect.any(String) } }
        : { success: true }
    );
    expect(withTenantAuthority).toHaveBeenCalledExactlyOnceWith(authority, expect.any(Function));
    expect(f.events).toEqual([
      'begin',
      'lock',
      'setting',
      'active',
      mode === 'create' ? 'insert' : 'update',
      'commit',
      'audit',
    ]);
    expect(audit).toHaveBeenCalledExactlyOnceWith({
      actorId: session.user.id,
      actorRole: session.user.role,
      action,
      entityType: 'branch',
      entityId: mode === 'create' ? f.values.mock.calls[0]?.[0].id : 'target',
      authority,
      metadata:
        mode === 'create'
          ? { name: 'Second', code: 'KS', slug: 'second' }
          : { name: 'Second', code: 'KS', isActive: undefined },
    });
  });

  it('does not emit a success audit if the write transaction fails', async () => {
    f.lock.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(write(params, { logAuditEvent: audit })).rejects.toThrow('database unavailable');
    expect(audit).not.toHaveBeenCalled();
  });
});
