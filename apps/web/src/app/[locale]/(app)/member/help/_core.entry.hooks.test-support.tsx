import { helpAuthority, mocks } from './_core.entry.test-support';
import { beforeEach, vi } from 'vitest';

export function installCoreHooks(): void {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.admit.mockResolvedValue({
      ok: true,
      authorized: {
        authority: helpAuthority,
        session: { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } },
      },
    });
    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockReturnValue(mocks.selectChain);
    mocks.selectChain.limit.mockImplementation((limit: number) =>
      Promise.resolve(
        limit === 1
          ? []
          : [
              {
                claimNumber: 'CLM-1',
                createdAt: new Date('2026-05-01T00:00:00.000Z'),
                id: 'claim-1',
                status: 'submitted',
                title: 'Claim one',
              },
            ]
      )
    );
  });
}
