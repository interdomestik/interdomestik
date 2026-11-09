import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it } from 'vitest';

import { getAgentUsersCore } from './get';

describe('actions/agent-users getAgentUsersCore', () => {
  it('throws Unauthorized when session is missing', async () => {
    await expect(
      getAgentUsersCore({ authority: mintTestTenantAuthority('tenant_ks'), session: null })
    ).rejects.toThrow('Unauthorized');
  });
});
