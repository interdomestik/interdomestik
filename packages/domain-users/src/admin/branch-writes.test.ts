import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', async () => ({
  ...(await import('@interdomestik/database/schema')),
  ...(await import('drizzle-orm')),
}));
import { createBranchInTransaction, updateBranchInTransaction } from './branch-writes';
import { branch, fixture, tenantId } from './branch-writes.test-support';

const dialect = new PgDialect();
const input = { name: 'Second', slug: 'second', code: null };

describe('single-active-branch writers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows the first branch and locks the tenant before reading policy or writing', async () => {
    const f = fixture();
    expect(await createBranchInTransaction(f.tx, tenantId, 'first', input)).toEqual({
      success: true,
      data: { branchId: 'first' },
    });
    expect(f.lock).toHaveBeenCalledTimes(1);
    expect(dialect.sqlToQuery(f.predicates[0])).toMatchObject({
      sql: 'select pg_advisory_xact_lock(hashtextextended($1, 0))',
      params: [`pilot-single-active-branch:${tenantId}`],
    });
    expect(f.events).toEqual(['lock', 'setting', 'active', 'insert']);
  });

  it('rejects a second active create by default with a non-leaking discriminated error', async () => {
    const f = fixture([branch('first')]);
    const result = await createBranchInTransaction(f.tx, tenantId, 'second', input);
    expect(result).toMatchObject({ code: 'single_branch_limit' });
    expect(JSON.stringify(result)).not.toContain('first');
    expect(f.values).not.toHaveBeenCalled();
    expect(f.events[0]).toBe('lock');
  });

  it('rejects reactivation but permits deactivation', async () => {
    const f = fixture([branch('first'), branch('second', false)]);
    expect(
      await updateBranchInTransaction(f.tx, tenantId, 'second', { ...input, isActive: true })
    ).toMatchObject({ code: 'single_branch_limit' });
    expect(f.update).not.toHaveBeenCalled();
    expect(
      await updateBranchInTransaction(f.tx, tenantId, 'first', {
        ...input,
        slug: 'first',
        isActive: false,
      })
    ).toEqual({ success: true });
    expect(f.rows.find(row => row.id === 'first')?.isActive).toBe(false);
  });

  it('allows sole-branch edits but guards the legacy omitted-status reactivation', async () => {
    const f = fixture([branch('first'), branch('second', false)]);
    expect(
      await updateBranchInTransaction(f.tx, tenantId, 'first', { ...input, slug: 'renamed' })
    ).toEqual({
      success: true,
    });
    expect(
      await updateBranchInTransaction(f.tx, tenantId, 'second', { ...input, slug: 'other' })
    ).toMatchObject({ code: 'single_branch_limit' });
    expect(f.rows.find(row => row.id === 'second')?.isActive).toBe(false);
  });

  it('allows multi-branch create and reactivation only with a tenant-local boolean opt-in', async () => {
    const f = fixture([branch('first'), branch('inactive', false)]);
    f.settings.push({
      tenantId,
      category: 'branches',
      key: 'multi_branch',
      value: { enabled: true },
    });
    expect(await createBranchInTransaction(f.tx, tenantId, 'second', input)).toHaveProperty(
      'success',
      true
    );
    expect(
      await updateBranchInTransaction(f.tx, tenantId, 'inactive', {
        name: 'Reactivated',
        slug: 'reactivated',
        code: null,
        isActive: true,
      })
    ).toEqual({ success: true });
    expect(f.lock).toHaveBeenCalledTimes(2);
  });

  it('ignores a foreign tenant opt-in and foreign active branches', async () => {
    const f = fixture([branch('first')]);
    f.settings.push({
      tenantId: 'tenant_mk',
      category: 'branches',
      key: 'multi_branch',
      value: { enabled: true },
    });
    expect(await createBranchInTransaction(f.tx, tenantId, 'second', input)).toMatchObject({
      code: 'single_branch_limit',
    });
    const other = fixture([branch('foreign', true, 'tenant_mk')]);
    expect(await createBranchInTransaction(other.tx, tenantId, 'first', input)).toHaveProperty(
      'success',
      true
    );
  });

  it.each([{}, { enabled: false }, { enabled: 'true' }])(
    'fails safe for malformed/disabled settings %j',
    async value => {
      const f = fixture([branch('first')]);
      f.settings.push({ tenantId, category: 'branches', key: 'multi_branch', value });
      expect(await createBranchInTransaction(f.tx, tenantId, 'second', input)).toMatchObject({
        code: 'single_branch_limit',
      });
    }
  );

  it('keeps an unmatched update tenant-scoped and preserves its success shape', async () => {
    const f = fixture([branch('foreign', false, 'tenant_mk')]);
    expect(
      await updateBranchInTransaction(f.tx, tenantId, 'foreign', { ...input, isActive: true })
    ).toEqual({ success: true });
    expect(f.rows[0].isActive).toBe(false);
    expect(f.update).toHaveBeenCalledTimes(1);
  });

  it.each(['create', 'update'] as const)(
    'rejects slug/code duplicates on %s before policy',
    async mode => {
      for (const field of ['slug', 'code'] as const) {
        const existing = {
          ...branch('other', false),
          [field]: field === 'slug' ? input.slug : 'KS',
        };
        const f = fixture([branch('target', false), existing, branch('active')]);
        const data = { ...input, code: 'KS' };
        const result =
          mode === 'create'
            ? await createBranchInTransaction(f.tx, tenantId, 'new', data)
            : await updateBranchInTransaction(f.tx, tenantId, 'target', data);
        expect(result).toEqual({
          error:
            field === 'slug'
              ? 'Branch with this name (slug) already exists'
              : 'Branch with this code already exists',
        });
        expect(f.values).not.toHaveBeenCalled();
        expect(f.update).not.toHaveBeenCalled();
        expect(f.events).toEqual(['lock']);
      }
    }
  );

  it('checks the supplied code before trimming it for persistence, as the legacy writer does', async () => {
    const f = fixture();
    expect(
      await createBranchInTransaction(f.tx, tenantId, 'new', { ...input, code: ' KS ' })
    ).toHaveProperty('success', true);
    expect(f.values).toHaveBeenCalledWith(expect.objectContaining({ code: 'KS' }));
    expect(dialect.sqlToQuery(f.predicates[2]).params).toEqual([tenantId, ' KS ']);
  });

  it('does not read policy or write when lock acquisition fails', async () => {
    const f = fixture();
    f.lock.mockRejectedValueOnce(new Error('lock unavailable'));
    await expect(createBranchInTransaction(f.tx, tenantId, 'first', input)).rejects.toThrow(
      'lock unavailable'
    );
    expect(f.events).toEqual([]);
    expect(f.values).not.toHaveBeenCalled();
  });
});
