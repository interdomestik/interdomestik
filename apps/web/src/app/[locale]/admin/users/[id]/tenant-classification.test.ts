import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTenantClassificationOptions } from './tenant-classification';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      tenants: {
        findMany: (...args: unknown[]) => mocks.findMany(...args),
      },
    },
  },
}));

describe('getTenantClassificationOptions', () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it('returns no reassignment options for non-super-admin sessions', async () => {
    const result = await getTenantClassificationOptions({
      session: { user: { role: 'tenant_admin' } },
      currentTenantId: 'tenant_ks',
    });

    expect(result).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('returns active tenant options excluding the current tenant for super admins', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'tenant_ks', name: 'Interdomestik (KS)', countryCode: 'XK' },
      { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' },
      { id: 'tenant_al', name: 'Interdomestik (AL)', countryCode: 'AL' },
    ]);

    const result = await getTenantClassificationOptions({
      session: { user: { role: 'super_admin' } },
      currentTenantId: 'tenant_ks',
    });

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' },
      { id: 'tenant_al', name: 'Interdomestik (AL)', countryCode: 'AL' },
    ]);
  });
});
