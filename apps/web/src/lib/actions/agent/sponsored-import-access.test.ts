import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getAgentTier: vi.fn(),
  withTenantAuthority: vi.fn(),
}));

vi.mock('@/app/[locale]/(agent)/agent/_layout.core', () => ({
  getAgentTier: hoisted.getAgentTier,
}));

vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: hoisted.withTenantAuthority,
}));

import { resolveSponsoredImportAccess, SPONSORED_IMPORT_SETTING } from './sponsored-import-access';

describe('resolveSponsoredImportAccess (OD-18 Option B)', () => {
  const authority = mintTestTenantAuthority('tenant-1', { userId: 'agent-1', role: 'agent' });
  const access = () => resolveSponsoredImportAccess({ agentId: 'agent-1', authority });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.withTenantAuthority.mockImplementation((_authority, callback) =>
      callback({ query: { tenantSettings: { findFirst: hoisted.findFirst } } })
    );
    hoisted.getAgentTier.mockResolvedValue('office');
  });

  it.each([
    ['no setting', undefined],
    ['a disabled setting', { value: { enabled: false } }],
    ['a truthy non-boolean', { value: { enabled: 'true' } }],
  ])('stays dark with %s, before any tier read', async (_label, row) => {
    hoisted.findFirst.mockResolvedValue(row);

    await expect(access()).resolves.toBe('dark');
    expect(hoisted.getAgentTier).not.toHaveBeenCalled();
  });

  it('reads only the tenant setting of the authority tenant', async () => {
    hoisted.findFirst.mockResolvedValue({ value: { enabled: true } });
    await access();

    expect(hoisted.withTenantAuthority).toHaveBeenCalledWith(authority, expect.any(Function));
    const [{ where }] = hoisted.findFirst.mock.calls[0];
    const eq = vi.fn((column: string, value: string) => `${column}=${value}`);
    const and = vi.fn((...parts: string[]) => parts);
    expect(where({ tenantId: 'tenant_id', category: 'category', key: 'key' }, { and, eq })).toEqual(
      [
        'tenant_id=tenant-1',
        `category=${SPONSORED_IMPORT_SETTING.category}`,
        `key=${SPONSORED_IMPORT_SETTING.key}`,
      ]
    );
  });

  it.each([
    ['office', 'allowed'],
    ['pro', 'not_office'],
    ['standard', 'not_office'],
  ])('an enabled tenant admits a %s agent as %s', async (tier, expected) => {
    hoisted.findFirst.mockResolvedValue({ value: { enabled: true } });
    hoisted.getAgentTier.mockResolvedValue(tier);

    await expect(access()).resolves.toBe(expected);
    expect(hoisted.getAgentTier).toHaveBeenCalledWith({ agentId: 'agent-1', authority });
  });
});
