import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ active: vi.fn(), headers: vi.fn(), cookies: vi.fn() }));
vi.mock('@interdomestik/database', () => ({ readActiveTenantId: mocks.active }));
vi.mock('next/headers', () => ({ headers: mocks.headers, cookies: mocks.cookies }));
import { resolveTenantIdFromRequest } from './tenant-request';

describe('explicit anonymous tenant ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active.mockImplementation((id: string) => Promise.resolve(id));
  });
  it.each(['tenant_ks', 'tenant_mk', 'pilot-mk'])(
    'accepts active choice or hint for %s',
    async id => {
      await expect(resolveTenantIdFromRequest({ choice: id })).resolves.toBe(id);
      await expect(resolveTenantIdFromRequest({ bookingHints: [id] })).resolves.toBe(id);
      await expect(resolveTenantIdFromRequest({ choice: id, bookingHints: [id] })).resolves.toBe(
        id
      );
      expect(mocks.headers).not.toHaveBeenCalled();
      expect(mocks.cookies).not.toHaveBeenCalled();
    }
  );
  it.each([
    undefined,
    {},
    { tenantIdFromQuery: 'tenant_ks' },
    { choice: 'tenant_al' },
    { choice: ' tenant_ks' },
    { bookingHints: ['tenant_ks', 'tenant_ks'] },
    { bookingHints: ['tenant_ks', 'tenant_mk'] },
    { bookingHints: [''] },
    { choice: 'tenant_mk', bookingHints: ['pilot-mk'] },
    { choice: ['tenant_ks'] },
  ])(
    'rejects missing, malformed, duplicate, unsupported or conflicting input %j before directory lookup',
    async input => {
      await expect(resolveTenantIdFromRequest(input)).rejects.toThrow();
      expect(mocks.active).not.toHaveBeenCalled();
    }
  );
  it('rejects inactive tenants and activity lookup failures', async () => {
    mocks.active.mockResolvedValueOnce(null);
    await expect(resolveTenantIdFromRequest({ choice: 'tenant_ks' })).rejects.toThrow(
      'unavailable'
    );
    mocks.active.mockRejectedValueOnce(new Error('directory down'));
    await expect(resolveTenantIdFromRequest({ choice: 'pilot-mk' })).rejects.toThrow(
      'directory down'
    );
  });
});
