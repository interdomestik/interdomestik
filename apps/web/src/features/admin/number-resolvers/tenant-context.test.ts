import type { TenantTransaction } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runNumberResolverInTenantContext } from './tenant-context';

const mocks = vi.hoisted(() => ({ withTenantContext: vi.fn() }));

vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));

// Narrow stand-in: the adapter only forwards the transaction, it never reads it.
const tx = { query: { marker: 'tenant-tx' } } as unknown as TenantTransaction;
const authority = mintTestTenantAuthority('tenant-access', {
  userId: 'admin-1',
  role: 'tenant_admin',
});

describe('runNumberResolverInTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      (_context: unknown, action: (t: TenantTransaction) => Promise<unknown>) => action(tx)
    );
  });

  it('delegates once with the exact authority and hands the actual transaction to the lookup', async () => {
    const lookup = vi.fn().mockResolvedValue('id-1');

    const result = await runNumberResolverInTenantContext(authority, lookup);

    expect(result).toBe('id-1');
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0][0]).toBe(authority);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0]).toBe(tx);
  });

  it('returns null when the lookup finds nothing', async () => {
    const result = await runNumberResolverInTenantContext(
      authority,
      vi.fn().mockResolvedValue(null)
    );

    expect(result).toBeNull();
  });

  it('propagates a lookup failure unchanged', async () => {
    const failure = new Error('connection terminated');

    await expect(
      runNumberResolverInTenantContext(authority, vi.fn().mockRejectedValue(failure))
    ).rejects.toBe(failure);
  });

  it('propagates a tenant-context failure without running the lookup', async () => {
    const failure = new Error('rls role not ready');
    mocks.withTenantContext.mockRejectedValueOnce(failure);
    const lookup = vi.fn();

    await expect(runNumberResolverInTenantContext(authority, lookup)).rejects.toBe(failure);

    expect(lookup).not.toHaveBeenCalled();
  });
});
