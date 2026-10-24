import type { TenantTransaction } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ambientFindFirst: vi.fn(),
  ambientSelect: vi.fn(),
  txFindFirst: vi.fn(),
  actorFindFirst: vi.fn(),
  txSelect: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: { agentClients: { findFirst: mocks.ambientFindFirst } },
    select: mocks.ambientSelect,
  },
  agentClients: {
    agentId: 'agentClients.agentId',
    memberId: 'agentClients.memberId',
    status: 'agentClients.status',
    tenantId: 'agentClients.tenantId',
  },
  claims: {
    id: 'claims.id',
    branchId: 'claims.branchId',
    staffId: 'claims.staffId',
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
  },
  user: { id: 'user.id', tenantId: 'user.tenantId' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions) => ({ op: 'and', conditions })),
  eq: vi.fn((column, value) => ({ op: 'eq', column, value })),
  inArray: vi.fn((column, values) => ({ op: 'inArray', column, values })),
  isNull: vi.fn(column => ({ op: 'isNull', column })),
  or: vi.fn((...conditions) => ({ op: 'or', conditions })),
}));

import { buildAccessibleClaimIdsSubquery } from './access';

const tx = {
  query: {
    agentClients: { findFirst: mocks.txFindFirst },
    user: { findFirst: mocks.actorFindFirst },
  },
  select: mocks.txSelect,
} as unknown as TenantTransaction;

describe('message claim access transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actorFindFirst.mockResolvedValue({ branchId: 'branch-a' });
    mocks.txSelect.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ where: mocks.where });
    mocks.where.mockReturnValue({ kind: 'tenant-subquery' });
  });
  it('builds the scoped claim query through the supplied tenant transaction', () => {
    buildAccessibleClaimIdsSubquery({
      role: 'staff',
      tenantId: 'tenant-1',
      userId: 'staff-1',
      tx,
    });

    expect(mocks.txSelect).toHaveBeenCalledWith({ id: 'claims.id' });
    expect(mocks.where).toHaveBeenCalledWith({
      op: 'and',
      conditions: [
        { op: 'eq', column: 'claims.tenantId', value: 'tenant-1' },
        {
          op: 'or',
          conditions: [
            { op: 'eq', column: 'claims.staffId', value: 'staff-1' },
            { op: 'isNull', column: 'claims.staffId' },
          ],
        },
      ],
    });
    expect(mocks.ambientSelect).not.toHaveBeenCalled();
  });
  it('limits agent read receipts to active linked clients in their branch or unassigned claims', () => {
    buildAccessibleClaimIdsSubquery({
      branchId: 'branch-a',
      role: 'agent',
      tenantId: 'tenant-1',
      userId: 'agent-1',
      tx,
    });

    expect(mocks.where).toHaveBeenNthCalledWith(1, {
      op: 'and',
      conditions: [
        { op: 'eq', column: 'agentClients.tenantId', value: 'tenant-1' },
        { op: 'eq', column: 'agentClients.agentId', value: 'agent-1' },
        { op: 'eq', column: 'agentClients.status', value: 'active' },
      ],
    });
    expect(mocks.where).toHaveBeenNthCalledWith(2, {
      op: 'and',
      conditions: [
        { op: 'eq', column: 'claims.tenantId', value: 'tenant-1' },
        { op: 'inArray', column: 'claims.userId', values: { kind: 'tenant-subquery' } },
        {
          op: 'or',
          conditions: [
            { op: 'eq', column: 'claims.branchId', value: 'branch-a' },
            { op: 'isNull', column: 'claims.branchId' },
          ],
        },
      ],
    });
  });
  it('fails closed when the claim subquery has no tenant transaction', () => {
    expect(() =>
      buildAccessibleClaimIdsSubquery({
        role: 'staff',
        tenantId: 'tenant-1',
        userId: 'staff-1',
      } as Parameters<typeof buildAccessibleClaimIdsSubquery>[0])
    ).toThrow();

    expect(mocks.ambientSelect).not.toHaveBeenCalled();
  });
  it.each([42, false, {}, []])('rejects invalid agent branch context %j', branchId => {
    expect(() =>
      buildAccessibleClaimIdsSubquery({
        branchId: branchId as unknown as string,
        role: 'agent',
        tenantId: 'tenant-1',
        userId: 'agent-1',
        tx,
      })
    ).toThrow('Invalid agent branch context');

    expect(mocks.txSelect).toHaveBeenCalledTimes(1);
    expect(mocks.txSelect).not.toHaveBeenCalledWith({ id: 'claims.id' });
    expect(eq).not.toHaveBeenCalledWith('claims.branchId', branchId);
    expect(mocks.ambientSelect).not.toHaveBeenCalled();
  });
  it('rejects a branch SQL wrapper without evaluating its getSQL getter', () => {
    const getSQL = vi.fn(() => {
      throw new Error('branch SQL wrapper evaluated');
    });
    const branchId = Object.defineProperty({}, 'getSQL', { get: getSQL });

    expect(() =>
      buildAccessibleClaimIdsSubquery({
        branchId: branchId as unknown as string,
        role: 'agent',
        tenantId: 'tenant-1',
        userId: 'agent-1',
        tx,
      })
    ).toThrow('Invalid agent branch context');
    expect(getSQL).not.toHaveBeenCalled();
    expect(mocks.txSelect).not.toHaveBeenCalledWith({ id: 'claims.id' });
  });
  it.each([null, undefined])('preserves agent access without a branch (%s)', branchId => {
    buildAccessibleClaimIdsSubquery({
      branchId,
      role: 'agent',
      tenantId: 'tenant-1',
      userId: 'agent-1',
      tx,
    });

    expect(mocks.where).toHaveBeenNthCalledWith(2, {
      op: 'and',
      conditions: [
        { op: 'eq', column: 'claims.tenantId', value: 'tenant-1' },
        { op: 'inArray', column: 'claims.userId', values: { kind: 'tenant-subquery' } },
        undefined,
      ],
    });
    expect(eq).not.toHaveBeenCalledWith('claims.branchId', expect.anything());
  });
  it('checks the already captured branch value without rereading the argument', () => {
    const branchId = vi.fn().mockReturnValueOnce('branch-a').mockReturnValue('branch-b');
    buildAccessibleClaimIdsSubquery({
      get branchId() {
        return branchId();
      },
      role: 'agent',
      tenantId: 'tenant-1',
      userId: 'agent-1',
      tx,
    });

    expect(branchId).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith('claims.branchId', 'branch-a');
    expect(eq).not.toHaveBeenCalledWith('claims.branchId', 'branch-b');
  });
});
