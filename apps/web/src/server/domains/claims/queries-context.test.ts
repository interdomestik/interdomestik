import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ context: vi.fn(), select: vi.fn() }));
vi.mock('@interdomestik/database', async () => ({
  claims: (await import('@interdomestik/database/schema')).claims,
  withTenantContext: h.context,
  // No global db: all queries must use the transaction supplied by the boundary.
}));
import { getClaimsListQuery } from './queries';

describe('claims list RLS connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('executes results and facets on the same tenant-scoped transaction', async () => {
    const rows = [{ claim: { id: 'owned', tenantId: 'tenant-ks' } }];
    const facets = { active: 1, draft: 0, closed: 0, total: 1 };
    const tx = { select: h.select };
    h.context.mockImplementation(async (_scope, run) => run(tx));
    for (const result of [rows, [facets]]) {
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => void) => resolve(result),
      };
      for (const method of ['from', 'leftJoin', 'where', 'orderBy', 'limit', 'offset'])
        builder[method] = vi.fn(() => builder);
      h.select.mockReturnValueOnce(builder);
    }
    const result = await getClaimsListQuery({
      tenantId: 'tenant-ks',
      userId: 'member-1',
      role: 'member',
      branchId: null,
    });
    expect(h.context).toHaveBeenCalledWith(
      { tenantId: 'tenant-ks', role: 'member' },
      expect.any(Function)
    );
    expect(h.select).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ rows, facets });
  });
  it('propagates context failure instead of fabricating an empty list', async () => {
    h.context.mockRejectedValueOnce(new Error('RLS unavailable'));
    await expect(
      getClaimsListQuery({
        tenantId: 'tenant-ks',
        userId: 'member-1',
        role: 'member',
        branchId: null,
      })
    ).rejects.toThrow('RLS unavailable');
    expect(h.select).not.toHaveBeenCalled();
  });
});
