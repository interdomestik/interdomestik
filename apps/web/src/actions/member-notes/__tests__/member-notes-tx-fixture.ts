import type { vi } from 'vitest';

/** Fresh per-test-file fake transaction state; no runtime database dependency. */
export function createMemberNotesTxFixture(mockFn: typeof vi.fn) {
  type Step = [string, ...unknown[]];
  type Rec = { txId: number; op: string; steps: Step[] };
  type Table = Record<string, string>;
  const open = new Set<number>();
  const state = {
    trace: [] as string[],
    ops: [] as Rec[],
    ambient: [] as string[],
    rows: [] as unknown[][],
    writeRows: [] as unknown[][],
    failBegin: new Set<number>(),
    failOp: new Map<string, Error>(),
    seq: 0,
    ids: 0,
  };
  const table = (name: string, columns: string[]): Table =>
    Object.fromEntries([
      ['__table', name],
      ...columns.map(column => [column, `${name}.${column}`]),
    ]);
  const noteColumns =
    'id tenantId memberId authorId type content isPinned isInternal followUpDate createdAt updatedAt';
  const memberNotes = table('member_notes', noteColumns.split(' '));
  const user = table('user', ['id', 'name']);
  const auditLog = table('audit_log', []);
  const tableOf = (rec: Rec): string => {
    const target =
      rec.op === 'select' ? rec.steps.find(step => step[0] === 'from')?.[1] : rec.steps[0]?.[1];
    const tableName = (target as Table | undefined)?.__table ?? 'unknown';
    if (typeof tableName !== 'string') {
      throw new TypeError('Table name must be a string');
    }
    return `${tableName}`;
  };
  const settle = (rec: Rec): Promise<unknown> => {
    const key = `${rec.op}:${tableOf(rec)}`;
    state.trace.push(key);
    if (!open.has(rec.txId)) return Promise.reject(new Error(`closed tx ${rec.txId}`));
    const failure = state.failOp.get(key);
    if (failure) return Promise.reject(failure);
    if (rec.op === 'select') return Promise.resolve(state.rows.shift() ?? []);
    if (rec.steps.some(step => step[0] === 'returning')) {
      return Promise.resolve(state.writeRows.shift() ?? []);
    }
    return Promise.resolve(undefined);
  };
  const chain = (txId: number, op: string, first: unknown): Record<string, unknown> => {
    const rec: Rec = { txId, op, steps: [[op, first]] };
    state.ops.push(rec);
    const builder: Record<string, unknown> = {
      then: (ok: (value: unknown) => unknown, ko: (reason: unknown) => unknown) =>
        settle(rec).then(ok, ko),
    };
    for (const method of [
      'from',
      'leftJoin',
      'where',
      'orderBy',
      'limit',
      'values',
      'set',
      'returning',
    ]) {
      builder[method] = (...args: unknown[]) => {
        rec.steps.push([method, ...args]);
        return builder;
      };
    }
    return builder;
  };
  const makeTx = (id: number) => ({
    select: (projection?: unknown) => chain(id, 'select', projection),
    insert: (target: unknown) => chain(id, 'insert', target),
    update: (target: unknown) => chain(id, 'update', target),
    delete: (target: unknown) => chain(id, 'delete', target),
  });
  const withTenantContext = mockFn(
    async (
      _context: { tenantId: string; role?: string | null },
      action: (tx: unknown) => Promise<unknown>
    ) => {
      const id = ++state.seq;
      state.trace.push(`begin:${id}`);
      if (state.failBegin.has(id)) throw new Error(`context setup failed ${id}`);
      open.add(id);
      try {
        const result = await action(makeTx(id));
        state.trace.push(`commit:${id}`);
        return result;
      } catch (error) {
        state.trace.push(`rollback:${id}`);
        throw error;
      } finally {
        open.delete(id);
      }
    }
  );
  const db = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (typeof property !== 'string' || property === 'then') return undefined;
        state.ambient.push(property);
        throw new Error(`ambient db.${property}`);
      },
    }
  );
  const reset = (): void => {
    state.trace.length = 0;
    state.ops.length = 0;
    state.ambient.length = 0;
    state.rows.length = 0;
    state.writeRows.length = 0;
    open.clear();
    state.failBegin.clear();
    state.failOp.clear();
    state.seq = 0;
    state.ids = 0;
    withTenantContext.mockClear();
  };
  const openTransactionCount = (): number => {
    const count = open.size;
    if (typeof count !== 'number') {
      throw new TypeError('Open transaction count must be a number');
    }
    return +count;
  };
  return {
    state,
    memberNotes,
    user,
    auditLog,
    tableOf,
    withTenantContext,
    db,
    reset,
    openTransactionCount,
  };
}
