// In-memory stand-in for the database module, for the member-notes unit tests. It evaluates the
// `and`/`eq` predicates the commands build, keeps rows per table, and records every statement
// (table, kind, lock) so tests can assert what ran, in which transaction and in which order.
// The real database proof is packages/database/test/member-notes-restricted-rls.test.ts (R-06).

type Row = Record<string, unknown>;
type Condition = { and: Condition[] } | { eq: [string, unknown] };
type Order = { desc: string };

type FakeTable = Record<string, string> & { __name: string };

function table(name: string, columns: readonly string[]): FakeTable {
  const out: Record<string, string> = { __name: name };
  for (const column of columns) out[column] = `${name}.${column}`;
  return out as FakeTable;
}

export const memberNotes = table('memberNotes', [
  'id',
  'tenantId',
  'memberId',
  'authorId',
  'type',
  'content',
  'isPinned',
  'isInternal',
  'followUpDate',
  'createdAt',
  'updatedAt',
]);
export const user = table('user', ['id', 'tenantId', 'role', 'name', 'agentId']);
export const agentClients = table('agentClients', [
  'id',
  'tenantId',
  'agentId',
  'memberId',
  'status',
]);

const tablesByName: Record<string, FakeTable> = { memberNotes, user, agentClients };

export type Statement = {
  tx: number;
  kind: 'select' | 'insert' | 'update' | 'delete';
  table: string;
  lock: 'share' | 'update' | null;
};

export const store = {
  rows: { memberNotes: [] as Row[], user: [] as Row[], agentClients: [] as Row[] },
  statements: [] as Statement[],
  transactions: 0,
  failNextSelect: null as Error | null,
  reset() {
    this.rows = { memberNotes: [], user: [], agentClients: [] };
    this.statements = [];
    this.transactions = 0;
    this.failNextSelect = null;
  },
};

const field = (column: string) => column.split('.')[1] ?? column;
const tableOf = (column: string) => column.split('.')[0] ?? '';

function matches(row: Row, condition: Condition | undefined): boolean {
  if (!condition) return true;
  if ('and' in condition) return condition.and.every(part => matches(row, part));
  const [column, value] = condition.eq;
  return row[field(column)] === value;
}

function project(row: Row, projection: Record<string, string> | undefined, joined: boolean): Row {
  if (!projection) return { ...row };
  const out: Row = {};
  for (const [alias, column] of Object.entries(projection)) {
    if (joined && tableOf(column) === 'user') {
      const author = store.rows.user.find(candidate => candidate.id === row.authorId);
      out[alias] = author ? author[field(column)] : null;
    } else {
      out[alias] = row[field(column)];
    }
  }
  return out;
}

function compareDesc(orders: Order[]) {
  return (left: Row, right: Row) => {
    for (const order of orders) {
      const key = field(order.desc);
      const a = left[key] as number | boolean | Date;
      const b = right[key] as number | boolean | Date;
      if (a === b) continue;
      return Number(b) - Number(a);
    }
    return 0;
  };
}

function selectQuery(txId: number, projection?: Record<string, string>) {
  const state = {
    table: '' as string,
    where: undefined as Condition | undefined,
    lock: null as Statement['lock'],
    limit: Infinity,
    joined: false,
    orders: [] as Order[],
  };
  const query = {
    from(target: FakeTable) {
      state.table = target.__name;
      return query;
    },
    leftJoin() {
      state.joined = true;
      return query;
    },
    where(condition: Condition) {
      state.where = condition;
      return query;
    },
    for(mode: 'share' | 'update') {
      state.lock = mode;
      return query;
    },
    limit(count: number) {
      state.limit = count;
      return query;
    },
    orderBy(...orders: Order[]) {
      state.orders = orders;
      return query;
    },
    then<T>(resolve: (rows: Row[]) => T, reject: (error: unknown) => T) {
      store.statements.push({ tx: txId, kind: 'select', table: state.table, lock: state.lock });
      if (store.failNextSelect) {
        const error = store.failNextSelect;
        store.failNextSelect = null;
        return Promise.reject(error).then(resolve, reject);
      }
      const rows = store.rows[state.table as keyof typeof store.rows]
        .filter(row => matches(row, state.where))
        .sort(compareDesc(state.orders))
        .slice(0, state.limit)
        .map(row => project(row, projection, state.joined));
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return query;
}

export function fakeTransaction() {
  store.transactions += 1;
  const txId = store.transactions;
  return {
    select: (projection?: Record<string, string>) => selectQuery(txId, projection),
    insert: (target: FakeTable) => ({
      values: async (row: Row) => {
        store.statements.push({ tx: txId, kind: 'insert', table: target.__name, lock: null });
        store.rows[target.__name as keyof typeof store.rows].push({ ...row });
      },
    }),
    update: (target: FakeTable) => ({
      set: (values: Row) => ({
        where: async (condition: Condition) => {
          store.statements.push({ tx: txId, kind: 'update', table: target.__name, lock: null });
          for (const row of store.rows[target.__name as keyof typeof store.rows]) {
            if (matches(row, condition)) Object.assign(row, values);
          }
        },
      }),
    }),
    delete: (target: FakeTable) => ({
      where: async (condition: Condition) => {
        store.statements.push({ tx: txId, kind: 'delete', table: target.__name, lock: null });
        const key = target.__name as keyof typeof store.rows;
        store.rows[key] = store.rows[key].filter(row => !matches(row, condition));
      },
    }),
  };
}

/** The mocked `@interdomestik/database` surface the member-notes module uses. */
export const databaseModule = {
  memberNotes,
  user,
  agentClients,
  and: (...conditions: Condition[]) => ({ and: conditions }),
  eq: (column: string, value: unknown) => ({ eq: [column, value] }),
  desc: (column: string) => ({ desc: column }),
  tablesByName,
};

/** The mocked `withTenantAuthority`: one fake transaction per call. */
export async function withFakeTenantAuthority<T>(
  _authority: unknown,
  body: (tx: ReturnType<typeof fakeTransaction>) => Promise<T>
): Promise<T> {
  return body(fakeTransaction());
}
