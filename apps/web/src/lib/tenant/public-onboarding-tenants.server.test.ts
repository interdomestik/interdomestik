import { beforeEach, describe, expect, it, vi } from 'vitest';
const active = vi.hoisted(() => vi.fn());
vi.mock('@interdomestik/database', () => ({ readActiveTenantId: active }));
import { loadPublicOnboardingTenants } from './public-onboarding-tenants.server';
describe('public onboarding pilot roster', () => {
  beforeEach(() => {
    active.mockReset();
  });
  it('lists only supported active tenants and keeps MK and pilot distinct', async () => {
    active.mockImplementation((id: string) => Promise.resolve(id === 'tenant_ks' ? null : id));
    await expect(loadPublicOnboardingTenants()).resolves.toEqual(['tenant_mk', 'pilot-mk']);
    expect(active.mock.calls.map(call => call[0])).toEqual(['tenant_ks', 'tenant_mk', 'pilot-mk']);
  });
  it('does not publish a partial roster on directory failure', async () => {
    active.mockRejectedValue(new Error('unavailable'));
    await expect(loadPublicOnboardingTenants()).rejects.toThrow('unavailable');
  });
});
