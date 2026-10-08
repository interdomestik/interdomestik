import { user } from '@interdomestik/database/schema';
import { and, eq, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_ALLOWED_ROLES } from '@/lib/rbac-portals';

import { getMemberNumberResolverCore, type MemberNumberTenantRunner } from './_core';

const dialect = new PgDialect();

describe('getMemberNumberResolverCore', () => {
  const tx = { query: { user: { findFirst: vi.fn() } } };
  const inTenantContext = vi.fn((lookup: Parameters<MemberNumberTenantRunner>[0]) =>
    lookup(tx as never)
  );
  const mockParse = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockParse.mockReturnValue(true);
  });

  function resolve(overrides: Partial<Parameters<typeof getMemberNumberResolverCore>[0]> = {}) {
    return getMemberNumberResolverCore({
      memberNumber: 'MEM-2024-000001',
      tenantId: 't1',
      role: 'tenant_admin',
      branchId: null,
      allowedRoles: ['tenant_admin'],
      parseMemberNumber: mockParse,
      inTenantContext,
      ...overrides,
    });
  }

  function lookupWhere(): SQL {
    const [{ where }] = tx.query.user.findFirst.mock.calls[0] as [{ where: SQL }];
    return where;
  }

  it('resolves valid member number for allowed role', async () => {
    tx.query.user.findFirst.mockResolvedValue({ id: 'u123' });
    const result = await resolve();
    expect(result).toEqual({ ok: true, userId: 'u123' });
  });

  it('queries only through the supplied tenant transaction with the exact tenant predicate', async () => {
    tx.query.user.findFirst.mockResolvedValue({ id: 'u123' });
    await resolve();
    expect(inTenantContext).toHaveBeenCalledTimes(1);
    expect(tx.query.user.findFirst).toHaveBeenCalledTimes(1);
    const [{ where, columns }] = tx.query.user.findFirst.mock.calls[0] as [
      { where: SQL; columns: Record<string, boolean> },
    ];
    expect(columns).toEqual({ id: true });
    expect(dialect.sqlToQuery(where)).toEqual(
      dialect.sqlToQuery(and(eq(user.memberNumber, 'MEM-2024-000001'), eq(user.tenantId, 't1'))!)
    );
  });

  it('returns FORBIDDEN for unauthorized role', async () => {
    const result = await resolve({ role: 'agent' });
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN without a lookup when the role is missing', async () => {
    const result = await resolve({ role: null });
    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for invalid format', async () => {
    mockParse.mockReturnValueOnce(null);
    const result = await resolve({ memberNumber: 'INVALID' });
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(mockParse).toHaveBeenCalledWith('INVALID');
    expect(inTenantContext).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the tenant-scoped lookup finds no member', async () => {
    tx.query.user.findFirst.mockResolvedValue(undefined);
    const result = await resolve();
    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(tx.query.user.findFirst).toHaveBeenCalledTimes(1);
  });

  it('propagates unexpected lookup failures instead of reporting NOT_FOUND', async () => {
    tx.query.user.findFirst.mockRejectedValueOnce(new Error('connection terminated'));
    await expect(resolve()).rejects.toThrow('connection terminated');
  });

  it('propagates tenant-context failures without querying', async () => {
    inTenantContext.mockRejectedValueOnce(new Error('rls role not ready'));
    await expect(resolve()).rejects.toThrow('rls role not ready');
    expect(tx.query.user.findFirst).not.toHaveBeenCalled();
  });

  describe('branch-scoped member reads', () => {
    const branchManager = {
      role: 'branch_manager',
      allowedRoles: ADMIN_ALLOWED_ROLES,
    } as const;

    it('adds the actor branch predicate with bound tenant and branch params', async () => {
      tx.query.user.findFirst.mockResolvedValue({ id: 'member-a' });
      expect(await resolve({ ...branchManager, branchId: 'b-A' })).toEqual({
        ok: true,
        userId: 'member-a',
      });
      const query = dialect.sqlToQuery(lookupWhere());
      expect(query).toEqual(
        dialect.sqlToQuery(
          and(
            eq(user.memberNumber, 'MEM-2024-000001'),
            eq(user.tenantId, 't1'),
            eq(user.branchId, 'b-A')
          )!
        )
      );
      expect(query.params).toEqual(['MEM-2024-000001', 't1', 'b-A']);
    });

    it('returns NOT_FOUND when the branch predicate excludes another-branch or unassigned members', async () => {
      tx.query.user.findFirst.mockResolvedValue(undefined);
      expect(await resolve({ ...branchManager, branchId: 'b-A' })).toEqual({
        ok: false,
        error: 'NOT_FOUND',
      });
      expect(dialect.sqlToQuery(lookupWhere()).params).toEqual(['MEM-2024-000001', 't1', 'b-A']);
    });

    it('binds the session access tenant, never another tenant', async () => {
      tx.query.user.findFirst.mockResolvedValue(undefined);
      await resolve({ ...branchManager, branchId: 'b-A', tenantId: 't-foreign' });
      expect(dialect.sqlToQuery(lookupWhere()).params).toEqual([
        'MEM-2024-000001',
        't-foreign',
        'b-A',
      ]);
    });

    it.each([null, ''])(
      'returns FORBIDDEN before parsing or a transaction for missing branch %j',
      async branchId => {
        expect(await resolve({ ...branchManager, branchId })).toEqual({
          ok: false,
          error: 'FORBIDDEN',
        });
        expect(mockParse).not.toHaveBeenCalled();
        expect(inTenantContext).not.toHaveBeenCalled();
      }
    );

    it.each(['admin', 'tenant_admin', 'super_admin'])(
      'keeps %s tenant-wide even when the session carries a branch',
      async role => {
        tx.query.user.findFirst.mockResolvedValue({ id: 'member-b' });
        expect(await resolve({ role, branchId: 'b-A', allowedRoles: ADMIN_ALLOWED_ROLES })).toEqual(
          { ok: true, userId: 'member-b' }
        );
        expect(dialect.sqlToQuery(lookupWhere()).params).toEqual(['MEM-2024-000001', 't1']);
      }
    );

    it.each(['staff', 'agent', 'member', 'global_support', 'auditor'])(
      'returns FORBIDDEN without a transaction for %s even if a caller admits it',
      async role => {
        expect(await resolve({ role, branchId: 'b-A', allowedRoles: [role] })).toEqual({
          ok: false,
          error: 'FORBIDDEN',
        });
        expect(inTenantContext).not.toHaveBeenCalled();
      }
    );
  });
});
