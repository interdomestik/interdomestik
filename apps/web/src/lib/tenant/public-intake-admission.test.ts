import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { authorizeOpenPublicIntake, isPublicCheckoutOpen } from './public-intake-admission';

const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  transaction: vi.fn(),
  read: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  authorizePublicSiteTenant: m.authorize,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: m.transaction,
}));
vi.mock('@interdomestik/database/pilot-switch', () => ({ readPilotSwitch: m.read }));
vi.mock('@sentry/nextjs', () => ({ captureException: m.capture }));

const authority = mintTestTenantAuthority('tenant_mk');
const tx = {};

describe('public intake authority', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.authorize.mockResolvedValue(authority);
    m.transaction.mockImplementation((_, effect) => effect(tx));
  });

  it('returns the same authorized capability used for both reads', async () => {
    m.read.mockResolvedValue({ state: 'open' });
    await expect(authorizeOpenPublicIntake('tenant_mk')).resolves.toBe(authority);
    await expect(isPublicCheckoutOpen(authority)).resolves.toBe(true);
    expect(m.transaction.mock.calls.map(([token]) => token)).toEqual([authority, authority]);
    expect(m.read.mock.calls).toEqual([
      [tx, 'tenant_mk', 'public_intake'],
      [tx, 'tenant_mk', 'new_sales'],
    ]);
  });

  it('refuses absent and closed tenants', async () => {
    await expect(authorizeOpenPublicIntake(null)).resolves.toBeNull();
    expect(m.authorize).not.toHaveBeenCalled();
    m.authorize.mockResolvedValueOnce(null);
    await expect(authorizeOpenPublicIntake('tenant_mk')).resolves.toBeNull();
    expect(m.transaction).not.toHaveBeenCalled();
    m.read.mockResolvedValue({ state: 'closed' });
    await expect(authorizeOpenPublicIntake('tenant_mk')).resolves.toBeNull();
    await expect(isPublicCheckoutOpen(authority)).resolves.toBe(false);
  });

  it('records read failures and closes', async () => {
    const error = new Error('test read failure');
    m.read.mockRejectedValue(error);
    await expect(authorizeOpenPublicIntake('tenant_mk')).resolves.toBeNull();
    await expect(isPublicCheckoutOpen(authority)).resolves.toBe(false);
    expect(m.capture).toHaveBeenCalledTimes(2);
    expect(m.capture).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
