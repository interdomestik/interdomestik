import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  insertHandoffGrant: vi.fn(),
  loadHandoffClaim: vi.fn(),
  lockHandoffClaim: vi.fn(),
  setRecoveryLegalTenantIfUnset: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  appendEvent: mocks.appendEvent,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('./jurisdiction-handoff-store', () => ({
  insertHandoffGrant: mocks.insertHandoffGrant,
  loadHandoffClaim: mocks.loadHandoffClaim,
  lockHandoffClaim: mocks.lockHandoffClaim,
  setRecoveryLegalTenantIfUnset: mocks.setRecoveryLegalTenantIfUnset,
}));

import { recordJurisdictionHandoff } from './jurisdiction-handoff';
import { baseClaim, baseParams, tx } from './jurisdiction-handoff-test-fixtures';

describe('recordJurisdictionHandoff grant expiry validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadHandoffClaim.mockResolvedValue(baseClaim);
    mocks.withTenantContext.mockImplementation(
      (_context: unknown, callback: (innerTx: typeof tx) => unknown) => callback(tx)
    );
  });

  it.each([new Date('2026-06-19T09:59:59Z'), baseParams.now])(
    'normalizes unusable grant expiry %s before grant insert',
    async grantExpiresAt => {
      await expect(recordJurisdictionHandoff({ ...baseParams, grantExpiresAt })).resolves.toEqual({
        success: false,
        error: 'handoff_grant_expired',
      });
      expect(mocks.setRecoveryLegalTenantIfUnset).not.toHaveBeenCalled();
      expect(mocks.insertHandoffGrant).not.toHaveBeenCalled();
    }
  );
});
