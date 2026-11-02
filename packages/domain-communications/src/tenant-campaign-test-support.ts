export type Clause = { op: string; left?: unknown; right?: unknown; clauses?: Clause[] };

/** Operators handed to relational-query `where` callbacks; they record the predicate tree. */
export const recordingOperators = {
  and: (...clauses: Array<Clause | undefined>): Clause => ({
    op: 'and',
    clauses: clauses.filter((clause): clause is Clause => clause !== undefined),
  }),
  between: (left: unknown, low: unknown, high: unknown): Clause => ({
    op: 'between',
    left,
    right: [low, high],
  }),
  eq: (left: unknown, right: unknown): Clause => ({ op: 'eq', left, right }),
  gt: (left: unknown, right: unknown): Clause => ({ op: 'gt', left, right }),
};

type WhereCallback = (table: never, operators: never) => unknown;

/** Evaluates a relational-query `where` callback against a column-name proxy table. */
export function evaluateWhere(where: unknown, tableName: string): Clause {
  const table = new Proxy({}, { get: (_target, prop) => `${tableName}.${String(prop)}` });
  return (where as WhereCallback)(table as never, recordingOperators as never) as Clause;
}

export function findClause(
  clause: Clause,
  op: string,
  left: string
): { right: unknown } | undefined {
  for (const child of clause.clauses ?? []) {
    if (child.op === op && child.left === left) return { right: child.right };
  }
  return undefined;
}

export type FakeUser = {
  id: string;
  email: string | null;
  name: string | null;
  tenantId: string;
};

/**
 * Simulates keyset pagination for one table so a test can see which tenant and cursor each page
 * request used. Pages are capped at `pageSize` rows to force multiple pages per tenant.
 */
export function pageRowsByTenant<TRow extends { id: string }>(
  rowsByTenant: Record<string, TRow[]>,
  where: unknown,
  tableName: string,
  pageSize: number
): { afterId: string | null; rows: TRow[]; tenantId: string } {
  const clause = evaluateWhere(where, tableName);
  const tenantId = findClause(clause, 'eq', `${tableName}.tenantId`)?.right as string;
  const afterId =
    (findClause(clause, 'gt', `${tableName}.id`)?.right as string | undefined) ?? null;
  const rows = (rowsByTenant[tenantId] ?? [])
    .filter(row => afterId === null || row.id > afterId)
    .slice(0, pageSize);
  return { afterId, rows, tenantId };
}
