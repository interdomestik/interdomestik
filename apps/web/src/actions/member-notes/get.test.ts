import { agentClients, memberNotes, user as userTable } from '@interdomestik/database/schema';
import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMemberNotesCore } from './get.core';
type QueryCall = {
  projection: Record<string, unknown>;
  from?: unknown;
  joins: Array<{ table: unknown; on: SQL }>;
  where?: SQL;
  orderBy: SQL[];
  limit?: number;
};
const state = vi.hoisted(() => ({
  results: [] as Array<unknown[] | Error>,
  calls: [] as unknown[],
  contextError: null as Error | null,
}));
const mocks = vi.hoisted(() => {
  const ambient = () => {
    throw new Error('ambient database access is forbidden');
  };
  const select = vi.fn();
  return {
    select,
    tx: { select },
    withTenantContext: vi.fn(),
    ensureTenantId: vi.fn((session: { user?: { tenantId?: string | null } } | null) => {
      const tenantId = session?.user?.tenantId;
      if (!tenantId) throw new Error('Missing tenantId');
      return tenantId;
    }),
    db: { select: vi.fn(ambient), query: {}, execute: vi.fn(ambient), transaction: vi.fn(ambient) },
    dbAdmin: { select: vi.fn(ambient), execute: vi.fn(ambient), transaction: vi.fn(ambient) },
  };
});
vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  dbAdmin: mocks.dbAdmin,
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));
const dialect = new PgDialect();
const render = (sqlObj: SQL) => dialect.sqlToQuery(sqlObj);
const col = (column: { name: string; table: unknown }) =>
  `"${getTableName(column.table as never)}"."${column.name}"`;
const calls = () => state.calls as QueryCall[];
function installTx() {
  mocks.select.mockImplementation((projection: Record<string, unknown>) => {
    const call: QueryCall = { projection, joins: [], orderBy: [] };
    state.calls.push(call);
    const index = state.calls.length - 1;
    const builder = {
      from: (table: unknown) => ((call.from = table), builder),
      leftJoin: (table: unknown, on: SQL) => (call.joins.push({ table, on }), builder),
      where: (condition: SQL) => ((call.where = condition), builder),
      orderBy: (...order: SQL[]) => ((call.orderBy = order), builder),
      limit: (n: number) => ((call.limit = n), builder),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const result =
          index < state.results.length
            ? state.results[index]
            : new Error(`unexpected query #${index}`);
        const promise = result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
        return promise.then(resolve, reject);
      },
    };
    return builder;
  });
  mocks.withTenantContext.mockImplementation(
    async (_ctx: unknown, action: (tx: unknown) => Promise<unknown>) => {
      if (state.contextError) throw state.contextError;
      return action(mocks.tx);
    }
  );
}
const session = (role: unknown, overrides: Record<string, unknown> = {}) =>
  ({ user: { id: 'agent-1', role, tenantId: 'tenant-1', ...overrides } }) as never;
const noteRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-1',
  memberId: 'member-1',
  authorId: 'author-1',
  authorName: 'Author',
  type: 'call',
  content: 'Called member',
  isPinned: false,
  isInternal: false,
  followUpDate: null,
  createdAt: new Date('2026-01-02T00:00:00Z'),
  updatedAt: null,
  ...overrides,
});
function expectNoAmbientAccess() {
  expect(mocks.db.select).not.toHaveBeenCalled();
  expect(mocks.db.execute).not.toHaveBeenCalled();
  expect(mocks.db.transaction).not.toHaveBeenCalled();
  expect(mocks.dbAdmin.select).not.toHaveBeenCalled();
  expect(mocks.dbAdmin.transaction).not.toHaveBeenCalled();
}
function expectNotesQuery(call: QueryCall) {
  expect(call.from).toBe(memberNotes);
  expect(Object.keys(call.projection)).toEqual([
    'id',
    'memberId',
    'authorId',
    'authorName',
    'type',
    'content',
    'isPinned',
    'isInternal',
    'followUpDate',
    'createdAt',
    'updatedAt',
  ]);
  expect(call.projection.authorName).toBe(userTable.name);
  expect(call.projection.isInternal).toBe(memberNotes.isInternal);
  expect(call.joins).toHaveLength(1);
  expect(call.joins[0].table).toBe(userTable);
  const join = render(call.joins[0].on);
  expect(join.sql).toContain(`${col(memberNotes.authorId)} = ${col(userTable.id)}`);
  const where = render(call.where as SQL);
  expect(where.sql).toContain(`${col(memberNotes.tenantId)} = $1`);
  expect(where.sql).toContain(`${col(memberNotes.memberId)} = $2`);
  expect(where.params).toEqual(['tenant-1', 'member-1']);
  expect(call.orderBy.map(o => render(o).sql)).toEqual([
    `${col(memberNotes.isPinned)} desc`,
    `${col(memberNotes.createdAt)} desc`,
  ]);
}
describe('getMemberNotesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.results = [];
    state.calls = [];
    state.contextError = null;
    installTx();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  it('admits an actively linked agent first, then reads notes in the same tenant context', async () => {
    state.results = [[{ id: 'link-1' }], [noteRow()]];
    const result = await getMemberNotesCore({ session: session('agent'), memberId: 'member-1' });
    expect(result).toEqual({
      success: true,
      data: [expect.objectContaining({ id: 'note-1', authorName: 'Author', type: 'call' })],
    });
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant-1',
      role: 'agent',
    });
    expect(calls()).toHaveLength(2);

    const admission = calls()[0];
    expect(admission.from).toBe(agentClients);
    expect(admission.limit).toBe(1);
    const where = render(admission.where as SQL);
    expect(where.sql).toContain(`${col(agentClients.tenantId)} = $1`);
    expect(where.sql).toContain(`${col(agentClients.agentId)} = $2`);
    expect(where.sql).toContain(`${col(agentClients.memberId)} = $3`);
    expect(where.sql).toContain(`${col(agentClients.status)} = $4`);
    expect(where.params).toEqual(['tenant-1', 'agent-1', 'member-1', 'active']);

    expectNotesQuery(calls()[1]);
    expectNoAmbientAccess();
  });

  it('denies an unlinked or inactive agent without reading notes', async () => {
    state.results = [[]];

    const result = await getMemberNotesCore({ session: session('agent'), memberId: 'member-1' });

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].from).toBe(agentClients);
    expect(console.error).not.toHaveBeenCalled();
    expectNoAmbientAccess();
  });

  it.each(['staff', 'admin'])(
    'preserves %s tenant-scoped access without an agent link',
    async role => {
      state.results = [[noteRow()]];

      const result = await getMemberNotesCore({
        session: session(role, { id: `${role}-1` }),
        memberId: 'member-1',
      });

      expect(result.success).toBe(true);
      expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
      expect(mocks.withTenantContext.mock.calls[0][0]).toEqual({ tenantId: 'tenant-1', role });
      expect(calls()).toHaveLength(1);
      expectNotesQuery(calls()[0]);
      expectNoAmbientAccess();
    }
  );

  it('preserves pinned/internal mapping and returned ordering', async () => {
    state.results = [
      [{ id: 'link-1' }],
      [
        noteRow({ id: 'pinned', isPinned: true, isInternal: true, authorName: null, type: null }),
        noteRow({ id: 'plain' }),
      ],
    ];

    const result = await getMemberNotesCore({ session: session('agent'), memberId: 'member-1' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.map(n => n.id)).toEqual(['pinned', 'plain']);
    expect(result.data![0]).toMatchObject({
      isPinned: true,
      isInternal: true,
      authorName: 'Unknown',
      type: 'general',
    });
  });

  it.each([null, { user: null }])('returns Unauthorized without a session user', async s => {
    const result = await getMemberNotesCore({ session: s as never, memberId: 'member-1' });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.ensureTenantId).not.toHaveBeenCalled();
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['member', 'AGENT', 'super_admin', '', undefined, null, 42])(
    'denies role %s before tenant resolution or any transaction',
    async role => {
      const result = await getMemberNotesCore({ session: session(role), memberId: 'member-1' });

      expect(result).toEqual({ success: false, error: 'Access denied' });
      expect(mocks.ensureTenantId).not.toHaveBeenCalled();
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it('denies an agent session without a user id before any transaction', async () => {
    const result = await getMemberNotesCore({
      session: session('agent', { id: '  ' }),
      memberId: 'member-1',
    });

    expect(result).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])(
    'fails closed on missing tenant (%s) before any transaction',
    async t => {
      const result = await getMemberNotesCore({
        session: session('agent', { tenantId: t }),
        memberId: 'member-1',
      });

      expect(result).toEqual({ success: false, error: 'Missing tenantId' });
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    }
  );

  it('maps tenant-context failure to the existing fetch error', async () => {
    state.contextError = new Error('context failed');

    const result = await getMemberNotesCore({ session: session('agent'), memberId: 'member-1' });

    expect(result).toEqual({ success: false, error: 'Failed to fetch notes' });
    expect(mocks.select).not.toHaveBeenCalled();
    expectNoAmbientAccess();
  });

  it('maps admission failure to the existing fetch error without reading notes', async () => {
    state.results = [new Error('admission failed')];

    const result = await getMemberNotesCore({ session: session('agent'), memberId: 'member-1' });

    expect(result).toEqual({ success: false, error: 'Failed to fetch notes' });
    expect(calls()).toHaveLength(1);
    expectNoAmbientAccess();
  });

  it('maps note query failure to the existing fetch error', async () => {
    state.results = [[{ id: 'link-1' }], new Error('notes failed')];

    const result = await getMemberNotesCore({ session: session('agent'), memberId: 'member-1' });

    expect(result).toEqual({ success: false, error: 'Failed to fetch notes' });
    expect(calls()).toHaveLength(2);
    expect(console.error).toHaveBeenCalledTimes(1);
    expectNoAmbientAccess();
  });
});
