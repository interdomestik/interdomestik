import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const tx = { marker: 'tenant-tx' };
  return {
    tx,
    withTenantContext: vi.fn(async (_context: unknown, callback: (scoped: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
});

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
}));

// The runner must never reach the ambient client: any access to it fails the test.
vi.mock('@interdomestik/database/db', () => ({
  get db(): never {
    throw new Error('CRM tenant runner touched the ambient db client');
  },
}));

import { runInCrmTenantContext } from './tenant-runner';

describe('runInCrmTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a tenant transaction from the authority, by identity, when no executor is injected', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    const action = vi.fn(async (scoped: unknown) => scoped);

    const result = await runInCrmTenantContext(undefined, authority, action);

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0][0]).toBe(authority);
    expect(action).toHaveBeenCalledWith(hoisted.tx);
    expect(result).toBe(hoisted.tx);
  });

  it('runs an injected executor unchanged and opens no tenant transaction', async () => {
    const injected = { marker: 'injected-executor' };
    const action = vi.fn(async (scoped: unknown) => scoped);

    const result = await runInCrmTenantContext(
      injected,
      mintTestTenantAuthority('tenant-1'),
      action
    );

    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledWith(injected);
    expect(result).toBe(injected);
  });

  it('rejects a forged authority instead of falling back to an ambient client', async () => {
    const forged = {} as never;
    const action = vi.fn(async (scoped: unknown) => scoped);

    await expect(runInCrmTenantContext(undefined, forged, action)).rejects.toThrow(
      'Unrecognized tenant authority'
    );
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
});
