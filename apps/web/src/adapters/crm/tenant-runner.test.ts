import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const db = { marker: 'ambient-db' };
  const tx = { marker: 'tenant-tx' };
  return {
    db,
    tx,
    withTenantContext: vi.fn(async (_context: unknown, callback: (scoped: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
});

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/database/db', () => ({
  db: hoisted.db,
}));

import { runInCrmTenantContext } from './tenant-runner';

describe('runInCrmTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces the ambient db client with a tenant transaction', async () => {
    const action = vi.fn(async (scoped: unknown) => scoped);

    const result = await runInCrmTenantContext(
      hoisted.db,
      { tenantId: 'tenant-1', role: 'agent' },
      action
    );

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'agent' },
      expect.any(Function)
    );
    expect(action).toHaveBeenCalledWith(hoisted.tx);
    expect(result).toBe(hoisted.tx);
  });

  it('runs an explicitly injected executor unchanged', async () => {
    const injected = { marker: 'injected-executor' };
    const action = vi.fn(async (scoped: unknown) => scoped);

    const result = await runInCrmTenantContext(injected, { tenantId: 'tenant-1' }, action);

    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledWith(injected);
    expect(result).toBe(injected);
  });
});
