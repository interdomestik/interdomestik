import { describe, expect, it, vi } from 'vitest';
import {
  hoisted,
  DIASPORA_NOTE_DE,
  ZERO_STATS,
  ADMIN_CONTEXT,
  mockQueryResults,
  expectOk,
  mainConditionArgs,
  createAdminRawRow,
} from './__tests__/admin-claims-query-fixtures';
import { getAdminClaimsV2 } from './getAdminClaimsV2';

describe('getAdminClaimsV2', () => {
  it('applies tenant predicate at query boundary for list reads', async () => {
    mockQueryResults([], 0);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    const andCallArgs = hoisted.and.mock.calls[0] ?? [];
    expect(andCallArgs).toContain('eq:claims.tenantId:tenant-A');
  });

  it('runs every read in one tenant transaction using the callback transaction', async () => {
    const context = { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null };
    mockQueryResults([{ claim: { id: 'claim-1' } }], 1, {
      history: [{ claimId: 'claim-1', note: DIASPORA_NOTE_DE }],
    });

    const result = expectOk(await getAdminClaimsV2(context));

    expect(result.kind).toBe('ok');
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant-A',
      role: 'admin',
    });
    // rows, history and count read through tx.select; stats receives the very same tx.
    expect(hoisted.txSelect).toHaveBeenCalledTimes(3);
    expect(hoisted.readAdminClaimStats).toHaveBeenCalledTimes(1);
    expect(hoisted.readAdminClaimStats.mock.calls[0]?.[0]).toBe(hoisted.tx);
    expect(hoisted.readAdminClaimStats.mock.calls[0]?.[1]).toEqual(context);
  });

  it('returns rows, stats and pagination for a populated page', async () => {
    const mappedRows = [{ id: 'c2' }, { id: 'c1' }];
    const stats = { ...ZERO_STATS, intake: 4, completed: 21 };
    hoisted.mapClaimsToOperationalRows.mockReturnValue(mappedRows);
    hoisted.readAdminClaimStats.mockResolvedValue(stats);
    mockQueryResults([{ claim: { id: 'c2' } }, { claim: { id: 'c1' } }], '25');

    const result = expectOk(await getAdminClaimsV2(ADMIN_CONTEXT, { page: 2, perPage: 10 }));

    expect(result.rows).toEqual(mappedRows);
    expect(result.stats).toEqual(stats);
    expect(result.pagination).toStrictEqual({
      page: 2,
      perPage: 10,
      totalCount: 25,
      totalPages: 3,
    });
    expect(hoisted.mainQuery.limit).toHaveBeenCalledWith(10);
    expect(hoisted.mainQuery.offset).toHaveBeenCalledWith(10);
  });

  it('returns a true empty page as ok with zero count, not as a read failure', async () => {
    mockQueryResults([], 0);

    const result = expectOk(await getAdminClaimsV2(ADMIN_CONTEXT));

    expect(result.rows).toEqual([]);
    expect(result.stats).toEqual(ZERO_STATS);
    expect(result.pagination).toStrictEqual({ page: 1, perPage: 20, totalCount: 0, totalPages: 0 });
    expect(hoisted.mapClaimsToOperationalRows).toHaveBeenCalledWith([]);
    expect(hoisted.txSelect).toHaveBeenCalledTimes(2);
    expect(hoisted.captureException).not.toHaveBeenCalled();
  });

  it('falls back to the first page of 20 for invalid page inputs', async () => {
    mockQueryResults([], 0);

    const result = expectOk(await getAdminClaimsV2(ADMIN_CONTEXT, { page: 0, perPage: -5 }));

    expect(result.pagination).toMatchObject({ page: 1, perPage: 20 });
    expect(hoisted.mainQuery.limit).toHaveBeenCalledWith(20);
    expect(hoisted.mainQuery.offset).toHaveBeenCalledWith(0);
  });

  it('uses deterministic ordering: updatedAt desc then id desc', async () => {
    mockQueryResults([{ claim: { id: 'claim-1' } }], 1);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    expect(hoisted.desc).toHaveBeenCalledWith('claims.updatedAt');
    expect(hoisted.desc).toHaveBeenCalledWith('claims.id');
  });

  it('returns deterministic results for same filters', async () => {
    const mappedRows = [{ id: 'c2' }, { id: 'c1' }];
    hoisted.mapClaimsToOperationalRows.mockReturnValue(mappedRows);

    mockQueryResults([{ claim: { id: 'raw-1' } }], 2);
    const first = expectOk(
      await getAdminClaimsV2(
        { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
        { lifecycleStage: 'intake', search: 'alpha', page: 1 }
      )
    );

    const firstOrderByArgs = hoisted.mainQuery.orderBy.mock.calls[0];

    mockQueryResults([{ claim: { id: 'raw-1' } }], 2);
    const second = expectOk(
      await getAdminClaimsV2(
        { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
        { lifecycleStage: 'intake', search: 'alpha', page: 1 }
      )
    );

    const secondOrderByArgs = hoisted.mainQuery.orderBy.mock.calls[1];

    expect(first.rows).toEqual(second.rows);
    expect(first.pagination).toEqual(second.pagination);
    expect(firstOrderByArgs).toEqual(secondOrderByArgs);
  });

  it('applies the lifecycle stage and trimmed search filters to the list and the count', async () => {
    mockQueryResults([], 0);

    await getAdminClaimsV2(ADMIN_CONTEXT, { lifecycleStage: 'completed', search: '  alpha ' });

    expect(hoisted.claimLifecycleStatusIn).toHaveBeenCalledWith(['resolved', 'rejected']);
    expect(hoisted.ilike).toHaveBeenCalledWith('claims.title', '%alpha%');
    expect(hoisted.ilike).toHaveBeenCalledWith('claims.id', '%alpha%');
    expect(hoisted.ilike).toHaveBeenCalledWith('user.email', '%alpha%');
    expect(hoisted.ilike).toHaveBeenCalledWith('user.name', '%alpha%');
    expect(mainConditionArgs()).toEqual([
      'eq:claims.tenantId:tenant-A',
      { type: 'lifecycle-in', statuses: ['resolved', 'rejected'] },
      {
        type: 'or',
        args: [
          'ilike:claims.title:%alpha%',
          'ilike:claims.id:%alpha%',
          'ilike:user.email:%alpha%',
          'ilike:user.name:%alpha%',
        ],
      },
    ]);
    // The count reuses the exact same predicate as the list.
    expect(hoisted.countQuery.where.mock.calls[0]?.[0]).toEqual(
      hoisted.mainQuery.where.mock.calls[0]?.[0]
    );
  });

  it('forwards diaspora provenance into the operational mapper input when history carries the canonical note', async () => {
    mockQueryResults([{ claim: { id: 'claim-1' } }], 1, {
      history: [{ claimId: 'claim-1', note: DIASPORA_NOTE_DE }],
    });

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    expect(hoisted.mapClaimsToOperationalRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          claim: expect.objectContaining({
            diasporaCountry: 'DE',
          }),
        }),
      ])
    );
  });

  it('reads history inside the claim tenant for exactly the returned claim ids', async () => {
    mockQueryResults([{ claim: { id: 'claim-1' } }, { claim: { id: 'claim-2' } }], 2);

    await getAdminClaimsV2(ADMIN_CONTEXT);

    expect(hoisted.eq).toHaveBeenCalledWith('claimStageHistory.tenantId', 'tenant-A');
    expect(hoisted.inArray).toHaveBeenCalledWith('claimStageHistory.claimId', [
      'claim-1',
      'claim-2',
    ]);
    expect(hoisted.desc).toHaveBeenCalledWith('claimStageHistory.createdAt');
    expect(hoisted.desc).toHaveBeenCalledWith('claimStageHistory.id');
  });

  it('handles unknown filter values safely as fail-closed no-op', async () => {
    mockQueryResults([], 0);

    await expect(
      getAdminClaimsV2(
        { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
        { lifecycleStage: 'not-a-real-stage' as never, status: '__bad__', assigned: '__bad__' }
      )
    ).resolves.not.toThrow();

    const andCallArgs = hoisted.and.mock.calls[0] ?? [];
    expect(andCallArgs).toEqual(['eq:claims.tenantId:tenant-A']);
    expect(hoisted.inArray).not.toHaveBeenCalled();
  });

  it('applies a shared diaspora-origin subquery when the diaspora filter is selected', async () => {
    mockQueryResults(
      [
        createAdminRawRow({
          id: 'claim-1',
          claimNumber: 'KS-0001',
          userId: 'member-1',
          title: 'Diaspora claim',
          claimantName: 'Member One',
          claimantEmail: 'member1@example.com',
        }),
        createAdminRawRow({
          id: 'claim-2',
          claimNumber: 'KS-0002',
          userId: 'member-2',
          title: 'Non diaspora claim',
          claimantName: 'Member Two',
          claimantEmail: 'member2@example.com',
        }),
      ],
      1,
      { history: [{ claimId: 'claim-1', note: DIASPORA_NOTE_DE }] }
    );
    hoisted.mapClaimsToOperationalRows.mockImplementation(rows =>
      rows.map((row: { claim: { id: string; diasporaCountry?: string | null } }) => ({
        id: row.claim.id,
        diasporaCountry: row.claim.diasporaCountry ?? null,
      }))
    );

    await getAdminClaimsV2(
      {
        tenantId: 'tenant-A',
        userId: 'u1',
        role: 'admin',
        branchId: null,
      },
      { diasporaOrigin: 'diaspora' as never }
    );

    expect(hoisted.buildDiasporaOriginClaimIdsSubquery).toHaveBeenCalledWith('tenant-A');
    expect(hoisted.inArray).toHaveBeenCalledWith('claims.id', 'diaspora-subquery');
  });

  it('composes the canonical diaspora builder into the outer query without executing it', async () => {
    const thenSpy = vi.fn(() => {
      throw new Error('diaspora subquery was awaited or executed');
    });
    const sentinel = { then: thenSpy };
    hoisted.diasporaBuilderResult.current = sentinel;
    mockQueryResults([], 0);

    const result = expectOk(
      await getAdminClaimsV2(ADMIN_CONTEXT, { diasporaOrigin: 'diaspora' as never })
    );

    expect(result.kind).toBe('ok');
    expect(hoisted.buildDiasporaOriginClaimIdsSubquery).toHaveBeenCalledTimes(1);
    expect(hoisted.buildDiasporaOriginClaimIdsSubquery).toHaveBeenCalledWith('tenant-A');
    // Built while the tenant transaction is open, never ahead of it.
    expect(hoisted.buildDiasporaOriginClaimIdsSubquery.mock.invocationCallOrder[0]).toBeGreaterThan(
      hoisted.withTenantContext.mock.invocationCallOrder[0] ?? Infinity
    );
    const diasporaCall = hoisted.inArray.mock.calls.find(([field]) => field === 'claims.id');
    expect(diasporaCall?.[1]).toBe(sentinel);
    expect(mainConditionArgs()).toEqual([
      'eq:claims.tenantId:tenant-A',
      { field: 'claims.id', values: sentinel },
    ]);
    // The count is filtered by the same diaspora condition as the list.
    expect(hoisted.countQuery.where.mock.calls[0]?.[0]).toEqual(
      hoisted.mainQuery.where.mock.calls[0]?.[0]
    );
    expect(thenSpy).not.toHaveBeenCalled();
    expect(hoisted.txSelect).toHaveBeenCalledTimes(2);
  });
});
