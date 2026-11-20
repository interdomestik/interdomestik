// CHK-12, fourth part: reads a built database and the twin of the declared schema. It opens no
// connection: the caller passes a client that a guarded entry point opened (R-13).
import {
  BUILT_FACTS_SQL,
  catalogFacts,
  FIXED_SEARCH_PATH,
  type FactRow,
  TWIN_FACTS_SQL,
} from './journal-schema-parity.catalog';
import { RENDERED_KINDS, type TwinStatement } from './journal-schema-parity.declared';

export type ParityQuery = Readonly<{
  unsafe: (query: string) => PromiseLike<unknown>;
}>;
export type ParityTransaction = ParityQuery &
  Readonly<{
    savepoint: (callback: (savepoint: ParityQuery) => Promise<unknown>) => PromiseLike<unknown>;
  }>;
export type ParityClient = ParityQuery &
  Readonly<{
    begin: (callback: (transaction: ParityTransaction) => Promise<unknown>) => PromiseLike<unknown>;
  }>;

export type Unbuildable = Readonly<{ key: string; error: string }>;

class Rollback extends Error {}

function factRows(rows: unknown): FactRow[] {
  if (!Array.isArray(rows)) throw new TypeError('the catalog query returns rows');
  return rows.map(row => {
    const { kind, parts, value } = row as Record<string, unknown>;
    if (typeof kind !== 'string' || !Array.isArray(parts) || typeof value !== 'string') {
      throw new TypeError(`a catalog row has no kind, parts or value: ${JSON.stringify(row)}`);
    }
    return { kind, parts, value };
  });
}

/** The built database's facts, read under the fixed search_path. */
export async function readBuiltFacts(query: ParityQuery): Promise<Map<string, string>> {
  await query.unsafe(FIXED_SEARCH_PATH);
  return catalogFacts(factRows(await query.unsafe(BUILT_FACTS_SQL)));
}

/**
 * Runs `work` in a transaction that is always rolled back, so nothing it creates or changes
 * outlives the call.
 */
export async function inRolledBackTransaction<T>(
  client: ParityClient,
  work: (transaction: ParityTransaction) => Promise<T>
): Promise<T> {
  let result: { value: T } | undefined;
  try {
    await client.begin(async transaction => {
      result = { value: await work(transaction) };
      throw new Rollback('rolled back on purpose');
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  if (!result) throw new Error('the rolled-back transaction returned nothing');
  return result.value;
}

// The twin's statements depend on one another (a table before its index), so they run one after
// the other, each in its own savepoint, so that one refusal leaves the others standing.
async function buildInOrder(
  transaction: ParityTransaction,
  statements: readonly TwinStatement[],
  position = 0,
  unbuildable: Unbuildable[] = []
): Promise<Unbuildable[]> {
  const statement = statements[position];
  if (!statement) return unbuildable;
  try {
    await transaction.savepoint(savepoint => Promise.resolve(savepoint.unsafe(statement.sql)));
  } catch (error) {
    unbuildable.push({
      key: statement.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return buildInOrder(transaction, statements, position + 1, unbuildable);
}

/**
 * Builds the twin of the declared schema in a rolled-back transaction and reads back what
 * PostgreSQL rendered. A statement PostgreSQL refuses is returned with its key and error.
 */
export function readDeclaredRendering(
  client: ParityClient,
  statements: readonly TwinStatement[]
): Promise<{ rendered: Map<string, string>; unbuildable: Unbuildable[] }> {
  return inRolledBackTransaction(client, async transaction => {
    await transaction.unsafe(FIXED_SEARCH_PATH);
    const unbuildable = await buildInOrder(transaction, statements);
    const twin = catalogFacts(factRows(await transaction.unsafe(TWIN_FACTS_SQL)), 'public');
    const rendered = new Map([...twin].filter(([key]) => RENDERED_KINDS.has(key.split(' ')[0])));
    return { rendered, unbuildable };
  });
}
