import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn(),
  updateWhere: vi.fn(),
  insertValues: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ withTenantContext: hoisted.withTenantContext }));

import type { ProtectedActionContext } from '@/lib/safe-action';
import { resubmitCashAttemptCore } from './resubmit-attempt';

function createTx() {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: () => hoisted.selectRows(),
  };
  return {
    select: () => selectChain,
    update: () => ({ set: () => ({ where: hoisted.updateWhere }) }),
    insert: () => ({ values: hoisted.insertValues }),
  };
}

describe('resubmitCashAttemptCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: ReturnType<typeof createTx>) => unknown) =>
        callback(createTx())
    );
  });

  it('runs under the session tenant authority and keeps the assigned-agent check', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    const ctx = {
      authority,
      tenantId: 'tenant-1',
      session: { user: { id: 'agent-1', role: 'agent' } },
    } as unknown as ProtectedActionContext;
    hoisted.selectRows.mockResolvedValueOnce([
      { attempt: { status: 'needs_info' }, lead: { agentId: 'agent-2' } },
    ]);

    await expect(
      resubmitCashAttemptCore(ctx, { attemptId: 'attempt-1', note: 'retry' } as never)
    ).rejects.toThrow('Only the assigned agent can resubmit this verification.');

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.updateWhere).not.toHaveBeenCalled();
    expect(hoisted.insertValues).not.toHaveBeenCalled();
  });

  it('resubmits a needs_info attempt for the assigned agent inside the authority transaction', async () => {
    const authority = mintTestTenantAuthority('tenant-1');
    const ctx = {
      authority,
      tenantId: 'tenant-1',
      session: { user: { id: 'agent-1', role: 'agent' } },
    } as unknown as ProtectedActionContext;
    hoisted.selectRows.mockResolvedValueOnce([
      { attempt: { status: 'needs_info' }, lead: { agentId: 'agent-1' } },
    ]);

    await expect(
      resubmitCashAttemptCore(ctx, { attemptId: 'attempt-1', note: 'retry' } as never)
    ).resolves.toEqual({ success: true });

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1', action: 'PAYMENT_RESUBMITTED' })
    );
  });
});
