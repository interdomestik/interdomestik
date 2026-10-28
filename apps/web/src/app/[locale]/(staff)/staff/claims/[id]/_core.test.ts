import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  claimsFindFirst: vi.fn(),
  ambientClaimsFindFirst: vi.fn(),
  historyFindMany: vi.fn(),
  withTenantContext: vi.fn(),
  dbSelect: vi.fn(),
  txSelect: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: { findFirst: hoisted.ambientClaimsFindFirst },
      claimStageHistory: { findMany: hoisted.historyFindMany },
    },
    select: hoisted.dbSelect,
  },
  withTenantContext: hoisted.withTenantContext,
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  claims: { id: 'claims.id', tenantId: 'claims.tenantId' },
  claimDocuments: {
    id: 'claimDocuments.id',
    claimId: 'claimDocuments.claimId',
    tenantId: 'claimDocuments.tenantId',
    name: 'claimDocuments.name',
    fileSize: 'claimDocuments.fileSize',
    fileType: 'claimDocuments.fileType',
    createdAt: 'claimDocuments.createdAt',
  },
  claimStageHistory: {
    id: 'claimStageHistory.id',
    claimId: 'claimStageHistory.claimId',
    tenantId: 'claimStageHistory.tenantId',
    fromStatus: 'claimStageHistory.fromStatus',
    toStatus: 'claimStageHistory.toStatus',
    note: 'claimStageHistory.note',
    isPublic: 'claimStageHistory.isPublic',
    createdAt: 'claimStageHistory.createdAt',
    changedById: 'claimStageHistory.changedById',
  },
  user: { id: 'user.id', name: 'user.name', email: 'user.email' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((x: unknown) => ({ desc: x })),
  isNotNull: vi.fn((x: unknown) => ({ isNotNull: x })),
}));

vi.mock('@interdomestik/domain-claims/staff-claims/scope', () => ({
  buildStaffClaimReadScope: vi.fn(() => ({ scope: true })),
}));

import { getStaffClaimDetailsCore, getPublicStatusHistoryCore } from './_core';
import { buildStaffClaimReadScope } from '@interdomestik/domain-claims/staff-claims/scope';

function createSelectChain(result: unknown, resolveAt: 'where' | 'orderBy') {
  const chain = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
  };

  if (resolveAt === 'where') {
    (chain.where as unknown as Mock).mockImplementationOnce(() => Promise.resolve(result));
  }

  return chain;
}

describe('getStaffClaimDetailsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.withTenantContext.mockImplementation((_context, read) =>
      read({ query: { claims: { findFirst: hoisted.claimsFindFirst } }, select: hoisted.txSelect })
    );
  });

  it('rejects a non-staff runtime role before opening tenant context', async () => {
    const result = await getStaffClaimDetailsCore({
      claimId: 'c1',
      role: 'member' as 'staff',
      staffId: 'staff-1',
      tenantId: 'tenant_mk',
    });

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
  });

  it('returns not_found when claim does not exist', async () => {
    hoisted.claimsFindFirst.mockResolvedValue(null);

    const result = await getStaffClaimDetailsCore({
      branchId: 'branch-a',
      claimId: 'c1',
      role: 'staff',
      staffId: 'staff-1',
      tenantId: 'tenant_mk',
    });

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.withTenantContext).toHaveBeenCalledExactlyOnceWith(
      { tenantId: 'tenant_mk', role: 'staff' },
      expect.any(Function)
    );
    expect(buildStaffClaimReadScope).toHaveBeenCalledExactlyOnceWith({
      branchId: 'branch-a',
      claimId: 'c1',
      userId: 'staff-1',
    });
    expect(hoisted.claimsFindFirst).toHaveBeenCalledExactlyOnceWith({
      where: { and: [{ eq: ['claims.tenantId', 'tenant_mk'] }, { scope: true }] },
      with: { user: true },
    });
    expect(hoisted.txSelect).not.toHaveBeenCalled();
    expect(hoisted.ambientClaimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });

  it('returns claim, documents (with fileName), and stage history', async () => {
    hoisted.claimsFindFirst.mockResolvedValue({
      id: 'c1',
      caseLifecycleState: 'submitted',
      recoveryLifecycleState: 'not_started',
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });

    const docsResult = [
      {
        id: 'd1',
        name: 'file.pdf',
        fileSize: 123,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    ];

    const historyResult = [
      {
        id: 'h1',
        fromStatus: 'draft',
        toStatus: 'submitted',
        note: 'ok',
        isPublic: false,
        createdAt: new Date('2025-01-02T00:00:00Z'),
        changedByName: 'Staff',
        changedByEmail: 'staff@example.com',
      },
    ];

    hoisted.txSelect
      .mockReturnValueOnce(createSelectChain(docsResult, 'where'))
      .mockReturnValueOnce(createSelectChain(historyResult, 'orderBy'));

    const result = await getStaffClaimDetailsCore({
      claimId: 'c1',
      role: 'staff',
      staffId: 'staff-1',
      tenantId: 'tenant_mk',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.claim.id).toBe('c1');
    expect(result.slaPhase).toBe('running');
    expect(result.documents).toEqual([
      {
        id: 'd1',
        fileName: 'file.pdf',
        fileSize: 123,
        fileType: 'application/pdf',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      },
    ]);

    expect(result.stageHistory).toEqual(historyResult);
    expect(hoisted.withTenantContext).toHaveBeenCalledExactlyOnceWith(
      { tenantId: 'tenant_mk', role: 'staff' },
      expect.any(Function)
    );
    expect(hoisted.txSelect).toHaveBeenCalledTimes(2);
    expect(hoisted.ambientClaimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });

  it('propagates tenant context failure without an ambient or child read', async () => {
    hoisted.withTenantContext.mockRejectedValueOnce(new Error('RLS context unavailable'));
    await expect(
      getStaffClaimDetailsCore({
        claimId: 'c1',
        role: 'staff',
        staffId: 'staff-1',
        tenantId: 'tenant_mk',
      })
    ).rejects.toThrow('RLS context unavailable');
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.txSelect).not.toHaveBeenCalled();
    expect(hoisted.ambientClaimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.dbSelect).not.toHaveBeenCalled();
  });
});

it('rejects a non-staff/branch runtime role before reading public status history', async () => {
  vi.clearAllMocks();
  await expect(
    getPublicStatusHistoryCore({
      claimId: 'c1',
      role: 'member' as 'staff',
      tenantId: 'tenant_mk',
    })
  ).resolves.toEqual([]);
  expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  expect(hoisted.historyFindMany).not.toHaveBeenCalled();
});

it('reads every public status entry for the authorized tenant and claim, newest first', async () => {
  const entries = [
    { id: 'newer', note: 'Later update' },
    { id: 'original', note: 'Uncertain save' },
  ];
  hoisted.historyFindMany.mockResolvedValueOnce(entries);
  hoisted.withTenantContext.mockImplementationOnce((_context, read) =>
    read({ query: { claimStageHistory: { findMany: hoisted.historyFindMany } } })
  );
  expect(
    await getPublicStatusHistoryCore({ claimId: 'c1', role: 'staff', tenantId: 'tenant_mk' })
  ).toEqual(entries);
  expect(hoisted.withTenantContext).toHaveBeenCalledExactlyOnceWith(
    { tenantId: 'tenant_mk', role: 'staff' },
    expect.any(Function)
  );
  expect(hoisted.historyFindMany).toHaveBeenCalledWith({
    where: {
      and: [
        { eq: ['claimStageHistory.claimId', 'c1'] },
        { eq: ['claimStageHistory.tenantId', 'tenant_mk'] },
        { eq: ['claimStageHistory.isPublic', true] },
      ],
    },
    columns: { id: true, note: true, toStatus: true, createdAt: true },
    orderBy: [{ desc: 'claimStageHistory.createdAt' }, { desc: 'claimStageHistory.id' }],
  });
});

it('uses the branch manager role in the same tenant transaction and propagates context failure', async () => {
  hoisted.withTenantContext.mockClear();
  hoisted.historyFindMany.mockClear();
  hoisted.withTenantContext.mockRejectedValueOnce(new Error('RLS context unavailable'));
  await expect(
    getPublicStatusHistoryCore({ claimId: 'c1', role: 'branch_manager', tenantId: 'tenant_mk' })
  ).rejects.toThrow('RLS context unavailable');
  expect(hoisted.withTenantContext).toHaveBeenCalledExactlyOnceWith(
    { tenantId: 'tenant_mk', role: 'branch_manager' },
    expect.any(Function)
  );
  expect(hoisted.historyFindMany).not.toHaveBeenCalled();
});
