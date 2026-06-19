import { beforeEach, describe, expect, it } from 'vitest';

import { getHandoffMocks, resetHandoffMocks } from './jurisdiction-handoff-test-mocks';
import { recordJurisdictionHandoff } from './jurisdiction-handoff';
import { baseParams } from './jurisdiction-handoff-test-fixtures';

const handoffMocks = getHandoffMocks();

describe('recordJurisdictionHandoff grant expiry validation', () => {
  beforeEach(() => {
    resetHandoffMocks({ tenantContext: true });
  });

  it.each([new Date('2026-06-19T09:59:59Z'), baseParams.now])(
    'normalizes unusable grant expiry %s before grant insert',
    async grantExpiresAt => {
      await expect(recordJurisdictionHandoff({ ...baseParams, grantExpiresAt })).resolves.toEqual({
        success: false,
        error: 'handoff_grant_expired',
      });
      expect(handoffMocks.setRecoveryLegalTenantIfUnset).not.toHaveBeenCalled();
      expect(handoffMocks.insertHandoffGrant).not.toHaveBeenCalled();
    }
  );
});
