import { vi } from 'vitest';

import { baseClaim, tx } from './jurisdiction-handoff-test-fixtures';

type HandoffTestMock = ReturnType<typeof vi.fn>;

type HandoffTestMocks = {
  appendEvent: HandoffTestMock;
  insertHandoffGrant: HandoffTestMock;
  loadHandoffClaim: HandoffTestMock;
  lockHandoffClaim: HandoffTestMock;
  setRecoveryLegalTenantIfUnset: HandoffTestMock;
  withTenantContext: HandoffTestMock;
};

const handoffMocks = vi.hoisted<HandoffTestMocks>(() => ({
  appendEvent: vi.fn(),
  insertHandoffGrant: vi.fn(),
  loadHandoffClaim: vi.fn(),
  lockHandoffClaim: vi.fn(),
  setRecoveryLegalTenantIfUnset: vi.fn(),
  withTenantContext: vi.fn(),
}));

export function getHandoffMocks(): typeof handoffMocks {
  return handoffMocks;
}

vi.mock('@interdomestik/database', () => ({
  appendEvent: handoffMocks.appendEvent,
  withTenantContext: handoffMocks.withTenantContext,
}));

vi.mock('./jurisdiction-handoff-store', () => ({
  insertHandoffGrant: handoffMocks.insertHandoffGrant,
  loadHandoffClaim: handoffMocks.loadHandoffClaim,
  lockHandoffClaim: handoffMocks.lockHandoffClaim,
  setRecoveryLegalTenantIfUnset: handoffMocks.setRecoveryLegalTenantIfUnset,
}));

export function resetHandoffMocks(options: { tenantContext?: boolean } = {}): void {
  vi.clearAllMocks();
  handoffMocks.loadHandoffClaim.mockResolvedValue(baseClaim);
  handoffMocks.setRecoveryLegalTenantIfUnset.mockResolvedValue(true);
  handoffMocks.insertHandoffGrant.mockResolvedValue('inserted');
  handoffMocks.appendEvent.mockResolvedValue(undefined);
  if (options.tenantContext) {
    handoffMocks.withTenantContext.mockImplementation((_context: unknown, callback: unknown) =>
      (callback as (innerTx: typeof tx) => unknown)(tx)
    );
  }
}
