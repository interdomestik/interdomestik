import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchClaims } from './claims.core';
import { wireResponse, wireRow } from '@/test/fixtures/claims-list-wire';

function mockFetch(body: unknown, init: { ok?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: init.ok ?? true, json: async () => body })
  );
}

describe('fetchClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the mounted V2 amount field onto claimAmount while preserving agent-consumed metadata', async () => {
    mockFetch(wireResponse([wireRow()]));

    const result = await fetchClaims({ scope: 'member', page: 1, perPage: 10 });

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]).toMatchObject({
      id: 'claim-1',
      title: 'Flight Delay',
      status: 'submitted',
      category: 'travel',
      claimAmount: '1200.00',
      currency: 'EUR',
      claimantName: 'Jane Doe',
      claimantEmail: 'jane@example.com',
      branchName: 'Branch One',
      branchCode: 'BR1',
      unreadCount: 2,
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    });
  });

  it('preserves existing V2 row and response metadata while adding the normalized amount', async () => {
    mockFetch(wireResponse([wireRow()]));
    expect(await fetchClaims({ scope: 'agent_queue' })).toMatchObject({
      totals: { active: 1, draft: 0, closed: 0 },
      claims: [
        {
          claimNumber: 'C-1001',
          currentStage: 'submitted',
          currentOwnerRole: 'staff',
          isStuck: false,
          daysInCurrentStage: 1,
          branchId: 'branch-1',
          staffName: null,
          staffEmail: null,
          assignedAt: null,
          amount: '1200.00',
          claimAmount: '1200.00',
        },
      ],
    });
  });

  it('keeps a zero amount instead of dropping it to null', async () => {
    mockFetch(wireResponse([wireRow({ amount: '0.00' })]));

    const result = await fetchClaims({ scope: 'member', page: 1 });

    expect(result.claims[0].claimAmount).toBe('0.00');
  });

  it('preserves a null amount as null', async () => {
    mockFetch(wireResponse([wireRow({ amount: null })]));

    const result = await fetchClaims({ scope: 'member', page: 1 });

    expect(result.claims[0].claimAmount).toBeNull();
  });

  it('safely nulls out a malformed (non-string) amount instead of throwing', async () => {
    mockFetch(wireResponse([wireRow({ amount: 1200 })]));

    const result = await fetchClaims({ scope: 'member', page: 1 });

    expect(result.claims[0].claimAmount).toBeNull();
  });

  it('safely nulls out a malformed (non-string) currency instead of throwing', async () => {
    mockFetch(wireResponse([wireRow({ currency: 123 })]));

    const result = await fetchClaims({ scope: 'member', page: 1 });

    expect(result.claims[0].currency).toBeNull();
  });

  it('rejects malformed row identity instead of silently hiding a case', async () => {
    mockFetch(wireResponse([wireRow({ id: 42 }), wireRow({ id: 'claim-2' })]));
    await expect(fetchClaims({ scope: 'member' })).rejects.toThrow('Failed to fetch claims');
  });

  it.each([
    { claims: null },
    { totalCount: undefined },
    { totalPages: -1 },
    { page: Number.POSITIVE_INFINITY },
  ])(
    'rejects malformed collection or pagination instead of inventing a successful result: %j',
    async overrides => {
      mockFetch({ ...wireResponse([wireRow()]), ...overrides });
      await expect(fetchClaims({ scope: 'member' })).rejects.toThrow('Failed to fetch claims');
    }
  );

  it('preserves finite numeric pagination from the existing API contract', async () => {
    mockFetch({ ...wireResponse([wireRow()]), page: 1.5 });
    expect(await fetchClaims({ scope: 'member', page: 1.5 })).toMatchObject({ page: 1.5 });
  });

  it('preserves the actual empty-list zero totalPages', async () => {
    mockFetch({ ...wireResponse([]), totalPages: 0 });
    expect(await fetchClaims({ scope: 'member' })).toMatchObject({
      claims: [],
      totalCount: 0,
      totalPages: 0,
    });
  });

  it('forwards agent scope, filters, abort signal and authenticated fetch options', async () => {
    mockFetch(wireResponse([wireRow()]));
    const signal = new AbortController().signal;
    const result = await fetchClaims({
      scope: 'agent_queue',
      page: 2,
      perPage: 10,
      search: 'synthetic',
      status: 'active',
      signal,
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/claims?scope=agent_queue&page=2&perPage=10&status=active&search=synthetic',
      { signal, credentials: 'include', cache: 'no-store' }
    );
    expect(result.claims[0]).toMatchObject({
      claimAmount: '1200.00',
      claimantName: 'Jane Doe',
      unreadCount: 2,
    });
  });

  it('does not fabricate facets the mounted response does not send', async () => {
    mockFetch(wireResponse([wireRow()]));

    const result = await fetchClaims({ scope: 'member', page: 1 });

    expect(result.facets).toBeUndefined();
  });

  it('throws when the response is not ok', async () => {
    mockFetch({}, { ok: false });

    await expect(fetchClaims({ scope: 'member', page: 1 })).rejects.toThrow(
      'Failed to fetch claims'
    );
  });

  it('throws the server-provided message when success is false', async () => {
    mockFetch({ success: false, error: 'Boom' });

    await expect(fetchClaims({ scope: 'member', page: 1 })).rejects.toThrow('Boom');
  });

  it('preserves pagination from the mounted response', async () => {
    mockFetch({
      success: true,
      claims: [],
      page: 2,
      perPage: 10,
      totalCount: 25,
      totalPages: 3,
    });

    const result = await fetchClaims({ scope: 'member', page: 2, perPage: 10 });

    expect(result).toMatchObject({ page: 2, perPage: 10, totalCount: 25, totalPages: 3 });
  });
});
