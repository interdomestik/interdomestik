import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  error: null as Error | null,
  select: vi.fn(),
  tenant: vi.fn(),
  eq: vi.fn((...pair: unknown[]) => pair),
  order: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ withTenantContext: h.tenant }));
vi.mock('@interdomestik/database/schema', () => {
  const table = (name: string) =>
    new Proxy({}, { get: (_target, key) => `${name}.${String(key)}` });
  return { claims: table('claim'), claimDocuments: table('document') };
});
vi.mock('drizzle-orm', () => ({
  and: (...parts: unknown[]) => parts,
  asc: (value: unknown) => value,
  count: (value: unknown) => value,
  eq: h.eq,
  sql: (parts: TemplateStringsArray) => parts.join('?'),
}));

import { getMemberCaseSummaries } from './get-member-case-summaries';

const get = (memberId = 'm', tenantId = 't') => getMemberCaseSummaries({ memberId, tenantId });
const chain: Record<string, unknown> = new Proxy(
  {},
  { get: (_target, key) => (key === 'orderBy' ? h.order : () => chain) }
);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'claim-1',
  category: 'vehicle',
  reference: 'CLM-001',
  caseLifecycleState: 'submitted',
  recoveryLifecycleState: 'not_started',
  documentCount: 0,
  createdAt: new Date('2026-08-20T10:00:00.000Z'),
  updatedAt: new Date('2026-08-21T11:30:00.000Z'),
  ...overrides,
});

describe('getMemberCaseSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.error = null;
    h.select.mockReturnValue(chain);
    h.order.mockImplementation(async () => {
      if (h.error) throw h.error;
      return h.rows;
    });
    h.tenant.mockImplementation(async (_context, action) => action({ select: h.select }));
  });

  it('fails closed without a tenant', async () => {
    await expect(get('m', '')).rejects.toThrow('Missing tenant context');
  });

  it('scopes one query and returns safe facts', async () => {
    h.rows = [row({ documentCount: 3 })];
    const result = await get('member-1', 'tenant-1');
    expect(h.tenant).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'member' },
      expect.any(Function)
    );
    expect(h.select).toHaveBeenCalledTimes(1);
    expect(h.eq.mock.calls.flat()).toEqual(
      'document.claimId claim.id document.tenantId tenant-1 claim.tenantId tenant-1 claim.userId member-1'.split(
        ' '
      )
    );
    expect(Object.keys(h.select.mock.calls[0][0])).toEqual(
      'id category reference caseLifecycleState recoveryLifecycleState documentCount createdAt updatedAt'.split(
        ' '
      )
    );
    expect(h.order.mock.calls[0]).toEqual([
      expect.stringMatching(/coalesce\(.+\) desc nulls last/u),
      'claim.id',
    ]);
    expect(Object.keys(result[0])).toHaveLength(7);
    expect([result[0].documentCount, result[0].nextStep, result[0].occurredAt]).toEqual([
      3,
      'team_review',
      '2026-08-21T11:30:00.000Z',
    ]);
  });

  it('keeps mixed categories exhaustive without exposing raw category', async () => {
    await expect(get()).resolves.toEqual([]);
    h.rows = [
      row({ id: 'vehicle', category: 'vehicle', caseLifecycleState: 'draft' }),
      row({ id: 'case-2', category: 'property' }),
      row({
        id: 'case-3',
        category: 'travel',
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'court',
      }),
    ];
    const result = await get();
    expect(result.map(item => [item.id, item.caseKind])).toEqual([
      ['vehicle', 'accident'],
      ['case-2', 'generic'],
      ['case-3', 'generic'],
    ]);
    expect(result.map(item => item.nextStep)).toEqual([
      'member_action',
      'team_review',
      'court_schedule',
    ]);
    expect(result[0].documentCount).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/property|travel|category|price|proof/u);
  });

  it('keeps undated cases and propagates errors', async () => {
    h.error = new Error('database unavailable');
    await expect(get()).rejects.toThrow('database unavailable');
    h.error = null;
    h.rows = [row({ recoveryLifecycleState: 'court' })];
    await expect(get()).rejects.toThrow('Invalid claim lifecycle state pair');
    h.rows = [row({ createdAt: null, updatedAt: null })];
    await expect(get()).resolves.toMatchObject([{ occurredAt: null }]);
  });
});
