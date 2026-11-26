import type { TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAssignableStaff } from './search-assignable-staff';

const { readTenantAuthority } = vi.hoisted(() => ({ readTenantAuthority: vi.fn() }));
vi.mock('@interdomestik/database/tenant-authority', () => ({ readTenantAuthority }));

const authority = {} as TenantAuthority;
const descriptor = {
  purpose: 'session',
  tenantId: 'tenant-1',
  accessTenantId: 'tenant-1',
  principal: { userId: 'admin-1', role: 'tenant_admin' },
};
const dial = new PgDialect();

function reader(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const select = vi.fn().mockReturnValue({ from: () => ({ where }) });
  return { tx: { select } as unknown as TenantTransaction, select, where, orderBy, limit };
}

beforeEach(() => readTenantAuthority.mockReset().mockReturnValue(descriptor));

describe('searchAssignableStaff', () => {
  it('uses tenant and role first, keyset ordering, literal search, and 25 plus one', async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({ id: `staff-${index + 1}` }));
    const { tx, select, where, limit, orderBy } = reader(rows);

    await expect(
      searchAssignableStaff(tx, { authority, search: 'A_%', afterId: 'staff-0' })
    ).resolves.toEqual({ items: rows.slice(0, 25), nextCursor: 'staff-25' });

    expect(Object.keys(select.mock.lastCall?.[0])).toEqual(['id', 'name', 'email']);
    const query = dial.sqlToQuery(where.mock.lastCall?.[0] as SQL);
    expect(query.params).toEqual(['tenant-1', 'staff', 'staff-0', '%A\\_\\%%', '%A\\_\\%%']);
    expect(query.sql).toMatch(/"tenant_id" = .*"role" = .*"id" > .*ilike/i);
    expect(dial.sqlToQuery(orderBy.mock.lastCall?.[0] as SQL).sql).toMatch(/"id" asc$/i);
    expect(limit).toHaveBeenCalledWith(26);
  });

  it.each(['branch_manager', 'staff', 'member', 'agent', null])(
    'denies role %s before reading',
    async role => {
      readTenantAuthority.mockReturnValueOnce({ ...descriptor, principal: { role } });
      const { tx, select } = reader([]);
      await expect(searchAssignableStaff(tx, { authority })).rejects.toThrow('Unauthorized');
      expect(select).not.toHaveBeenCalled();
    }
  );

  it('denies a delegated tenant and propagates a read failure', async () => {
    readTenantAuthority.mockReturnValueOnce({ ...descriptor, accessTenantId: 'tenant-2' });
    const { tx, select, limit } = reader([]);
    await expect(searchAssignableStaff(tx, { authority })).rejects.toThrow('Unauthorized');
    expect(select).not.toHaveBeenCalled();
    limit.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(searchAssignableStaff(tx, { authority })).rejects.toThrow('Unavailable');
  });
});
