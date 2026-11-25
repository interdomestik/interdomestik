import type { AcceptanceState } from '@interdomestik/domain-privacy/acceptance';
import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, vi } from 'vitest';

const readAcceptance = vi.hoisted(() =>
  vi.fn<
    (
      ...args: Parameters<
        typeof import('@interdomestik/domain-privacy/acceptance').readOwnAcceptanceState
      >
    ) => Promise<AcceptanceState>
  >()
);

/** Refuse the next read while leaving the entry's real admission logic in place. */
export function refuseAcceptance() {
  readAcceptance.mockResolvedValueOnce({
    accepted: false,
    missing: [{ kind: 'terms', version: 'fixture-current' }],
  });
}

vi.mock('@interdomestik/domain-privacy/acceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/domain-privacy/acceptance')>()),
  readOwnAcceptanceState: readAcceptance,
}));

beforeEach(() => {
  readAcceptance.mockReset().mockResolvedValue({ accepted: true });
});

export function fixtureSessionAuthority(
  tenantId: string,
  user: {
    id: string;
    role?: string | null;
    branchId?: string | null;
    agentId?: string | null;
  }
) {
  return mintTenantAuthority({
    tenantId,
    accessTenantId: tenantId,
    purpose: 'session',
    principal: {
      userId: user.id,
      role: user.role ?? null,
      branchId: user.branchId ?? null,
      agentId: user.agentId ?? null,
    },
  });
}
