import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTenantClassificationOptions } from './tenant-classification';

const mocks = vi.hoisted(() => ({
  listActiveTenantDirectory: vi.fn(),
}));

vi.mock('@interdomestik/database/platform-directory', () => ({
  listActiveTenantDirectory: (...args: unknown[]) => mocks.listActiveTenantDirectory(...args),
}));

describe('getTenantClassificationOptions', () => {
  beforeEach(() => {
    mocks.listActiveTenantDirectory.mockReset();
  });

  it('returns no reassignment options for non-super-admin sessions', async () => {
    const result = await getTenantClassificationOptions({
      session: { user: { role: 'tenant_admin' } },
      currentTenantId: 'tenant_ks',
    });

    expect(result).toEqual([]);
    expect(mocks.listActiveTenantDirectory).not.toHaveBeenCalled();
  });

  it('returns active tenant options excluding the current tenant for super admins', async () => {
    mocks.listActiveTenantDirectory.mockResolvedValue([
      { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' },
      { id: 'tenant_al', name: 'Interdomestik (AL)', countryCode: 'AL' },
    ]);

    const result = await getTenantClassificationOptions({
      session: { user: { role: 'super_admin' } },
      currentTenantId: 'tenant_ks',
    });

    expect(mocks.listActiveTenantDirectory).toHaveBeenCalledTimes(1);
    expect(mocks.listActiveTenantDirectory).toHaveBeenCalledWith({ excludeTenantId: 'tenant_ks' });
    expect(result).toEqual([
      { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' },
      { id: 'tenant_al', name: 'Interdomestik (AL)', countryCode: 'AL' },
    ]);
  });

  it('returns no options and reads nothing when the current tenant is missing', async () => {
    const result = await getTenantClassificationOptions({
      session: { user: { role: 'super_admin' } },
      currentTenantId: '',
    });

    expect(result).toEqual([]);
    expect(mocks.listActiveTenantDirectory).not.toHaveBeenCalled();
  });

  it('maps directory entries to id, name and country code only', async () => {
    mocks.listActiveTenantDirectory.mockResolvedValue([
      { id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK', extra: 'x' },
    ]);

    const result = await getTenantClassificationOptions({
      session: { user: { role: 'super_admin' } },
      currentTenantId: 'tenant_ks',
    });

    expect(result).toEqual([{ id: 'tenant_mk', name: 'Interdomestik (MK)', countryCode: 'MK' }]);
  });
});
