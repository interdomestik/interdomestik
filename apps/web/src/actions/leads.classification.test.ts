import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
const m = vi.hoisted(() => ({
  active: vi.fn(),
  authorize: vi.fn(),
  context: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  readActiveTenantId: m.active,
  authorizePublicSiteTenant: m.authorize,
  withTenantContext: m.context,
}));
vi.mock('@interdomestik/database/schema', () => ({ leads: {} }));
import { submitLead } from './leads';
const data = { name: 'Test Lead', phone: '123456789', category: 'auto' };
describe('unmounted callback server ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    m.active.mockImplementation((id: string) => Promise.resolve(id));
    m.authorize.mockImplementation((id: string) => Promise.resolve(mintTestTenantAuthority(id)));
    m.context.mockImplementation((_authority, work) =>
      work({ insert: () => ({ values: m.insert }) })
    );
    m.insert.mockResolvedValue(undefined);
  });
  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'] as const)(
    'writes %s under explicit public authority',
    async choice => {
      expect(await submitLead({ ...data, classification: { choice } })).toEqual({ success: true });
      expect(m.authorize).toHaveBeenCalledExactlyOnceWith(choice);
      expect(readTenantAuthority(m.context.mock.calls[0][0]).tenantId).toBe(choice);
      expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ tenantId: choice }));
    }
  );
  it('accepts one validated booking hint', async () => {
    expect(
      (await submitLead({ ...data, classification: { bookingHints: ['pilot-mk'] } })).success
    ).toBe(true);
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'pilot-mk' }));
  });
  it.each([
    undefined,
    {},
    { choice: 'tenant_al' },
    { choice: 'tenant_mk', bookingHints: ['pilot-mk'] },
    { bookingHints: ['tenant_ks', 'tenant_ks'] },
  ])('rejects %j before any effect', async classification => {
    expect((await submitLead({ ...data, classification } as never)).success).toBe(false);
    expect(m.authorize).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it('denies inactive tenants and deactivation at the authority boundary', async () => {
    m.active.mockResolvedValueOnce(null);
    expect((await submitLead({ ...data, classification: { choice: 'tenant_mk' } })).success).toBe(
      false
    );
    m.authorize.mockResolvedValueOnce(null);
    expect((await submitLead({ ...data, classification: { choice: 'pilot-mk' } })).success).toBe(
      false
    );
    expect(m.insert).not.toHaveBeenCalled();
  });
});
