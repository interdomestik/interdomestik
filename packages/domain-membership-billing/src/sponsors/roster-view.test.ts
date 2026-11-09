import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(() => {
    throw new Error('no database access expected');
  }),
}));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: () => ({ tenantId: 'tenant_ks' }),
}));

import type { SponsorActor } from './access';
import { listSponsorsForActor, readSponsorRoster } from './roster-view';

const actor = (role: string, over: Partial<SponsorActor> = {}): SponsorActor => ({
  userId: 'usr_1',
  role,
  branchId: null,
  agentTier: null,
  ...over,
});

describe('sponsor roster read model access', () => {
  it.each([
    actor('auditor'),
    actor('global_support'),
    actor('member'),
    actor('agent', { agentTier: 'field' }),
    actor('branch_manager'),
  ])('shows nothing to $role without a scope, before any read', async who => {
    const hasCredential = vi.fn();
    await expect(listSponsorsForActor({} as never, who)).resolves.toEqual([]);
    await expect(
      readSponsorRoster({} as never, who, { hasCredential }, { termId: 'spt_1', now: new Date() })
    ).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(hasCredential).not.toHaveBeenCalled();
  });
});
