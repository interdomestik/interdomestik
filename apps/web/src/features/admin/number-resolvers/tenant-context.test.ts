import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runNumberResolverInTenantContext } from './tenant-context';

const mocks = vi.hoisted(() => ({ withTenantContext: vi.fn() }));

vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));

// Narrow stand-in: the adapter only forwards the transaction, it never reads it.
const tx = { query: { marker: 'tenant-tx' } } as unknown as TenantTransaction;

describe('runNumberResolverInTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      (_context: unknown, action: (t: TenantTransaction) => Promise<unknown>) => action(tx)
    );
  });

  it('delegates once with the exact context and hands the actual transaction to the lookup', async () => {
    const lookup = vi.fn().mockResolvedValue('id-1');

    const result = await runNumberResolverInTenantContext(
      { tenantId: 'tenant-access', role: 'tenant_admin' },
      lookup
    );

    expect(result).toBe('id-1');
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-access',
      role: 'tenant_admin',
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0]).toBe(tx);
  });

  it('preserves a null role without substituting one', async () => {
    await runNumberResolverInTenantContext(
      { tenantId: 'tenant-access', role: null },
      vi.fn().mockResolvedValue('id-1')
    );

    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-access',
      role: null,
    });
  });

  it('returns null when the lookup finds nothing', async () => {
    const result = await runNumberResolverInTenantContext(
      { tenantId: 'tenant-access', role: 'tenant_admin' },
      vi.fn().mockResolvedValue(null)
    );

    expect(result).toBeNull();
  });

  it('propagates a lookup failure unchanged', async () => {
    const failure = new Error('connection terminated');

    await expect(
      runNumberResolverInTenantContext(
        { tenantId: 'tenant-access', role: 'tenant_admin' },
        vi.fn().mockRejectedValue(failure)
      )
    ).rejects.toBe(failure);
  });

  it('propagates a tenant-context failure without running the lookup', async () => {
    const failure = new Error('rls role not ready');
    mocks.withTenantContext.mockRejectedValueOnce(failure);
    const lookup = vi.fn();

    await expect(
      runNumberResolverInTenantContext({ tenantId: 'tenant-access', role: 'tenant_admin' }, lookup)
    ).rejects.toBe(failure);

    expect(lookup).not.toHaveBeenCalled();
  });
});
