// CHK-12, fourth part: the declared schema. Facts the snapshot states as structure (tables,
// keys, enums) are written here directly; facts that are expressions (column types, defaults,
// checks, indexes, policies) are built as a twin in a scratch schema and rendered by PostgreSQL.
import { factKey, TWIN_SCHEMA } from './journal-schema-parity.catalog';

type SnapshotColumn = {
  name: string;
  type: string;
  typeSchema?: string;
  primaryKey?: boolean;
  notNull?: boolean;
  default?: string | number | boolean;
  identity?: unknown;
  generated?: unknown;
};
type SnapshotIndexColumn = {
  expression: string;
  isExpression: boolean;
  asc: boolean;
  nulls?: string;
  opclass?: string;
};
type SnapshotIndex = {
  name: string;
  columns: SnapshotIndexColumn[];
  isUnique: boolean;
  method?: string;
  where?: string;
  with?: Record<string, unknown>;
};
type SnapshotPolicy = {
  name: string;
  as?: string;
  for?: string;
  to?: string[];
  using?: string;
  withCheck?: string;
};
type SnapshotTable = {
  name: string;
  schema?: string;
  columns: Record<string, SnapshotColumn>;
  indexes?: Record<string, SnapshotIndex>;
  foreignKeys?: Record<
    string,
    {
      tableTo: string;
      schemaTo?: string;
      columnsFrom: string[];
      columnsTo: string[];
      onDelete?: string;
      onUpdate?: string;
    }
  >;
  compositePrimaryKeys?: Record<string, { name: string; columns: string[] }>;
  uniqueConstraints?: Record<
    string,
    { name: string; columns: string[]; nullsNotDistinct?: boolean }
  >;
  checkConstraints?: Record<string, { name: string; value: string }>;
  policies?: Record<string, SnapshotPolicy>;
  isRLSEnabled?: boolean;
};
type SnapshotView = {
  name: string;
  schema?: string;
  columns: Record<string, SnapshotColumn>;
  isExisting?: boolean;
  definition?: string;
  materialized?: boolean;
};
export type DrizzleSnapshot = {
  tables: Record<string, SnapshotTable>;
  enums: Record<string, { name: string; schema?: string; values: string[] }>;
  views?: Record<string, SnapshotView>;
  schemas?: Record<string, string>;
  sequences?: Record<string, unknown>;
  roles?: Record<string, unknown>;
  policies?: Record<string, unknown>;
};

/** One statement of the twin, with the fact it builds, so that a failure names that fact. */
export type TwinStatement = Readonly<{ key: string; sql: string }>;

const PUBLIC = 'public';
const ROLE_KEYWORDS = new Set(['public', 'current_user', 'current_role', 'session_user']);

export const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const twin = (name: string) => `${quoteIdentifier(TWIN_SCHEMA)}.${quoteIdentifier(name)}`;

function unsupportedInTable(table: SnapshotTable): string[] {
  const found: string[] = [];
  if ((table.schema || PUBLIC) !== PUBLIC) found.push(`table ${table.schema}.${table.name}`);
  for (const column of Object.values(table.columns)) {
    if (column.identity || column.generated) found.push(`column ${table.name}.${column.name}`);
  }
  for (const index of Object.values(table.indexes ?? {})) {
    if (Object.keys(index.with ?? {}).length > 0) found.push(`index options ${index.name}`);
  }
  return found;
}

// The parts of the snapshot this comparison does not model are refused, not ignored.
function assertModelled(snapshot: DrizzleSnapshot): void {
  const unsupported = [
    ...Object.values(snapshot.tables).flatMap(unsupportedInTable),
    ...Object.values(snapshot.views ?? {})
      .filter(view => !view.isExisting || view.materialized)
      .map(view => `view definition ${view.name}`),
    ...Object.values(snapshot.views ?? {})
      .filter(view => (view.schema || PUBLIC) !== PUBLIC)
      .map(view => `view ${view.schema}.${view.name}`),
    ...(['schemas', 'sequences', 'roles', 'policies'] as const)
      .filter(part => Object.keys(snapshot[part] ?? {}).length > 0)
      .map(part => `snapshot ${part}`),
  ];
  if (unsupported.length > 0) {
    throw new Error(`the parity model does not cover: ${unsupported.join(', ')}`);
  }
}

function columnType(column: SnapshotColumn): string {
  if (!column.typeSchema) return column.type;
  const array = column.type.endsWith('[]') ? '[]' : '';
  const base = array ? column.type.slice(0, -2) : column.type;
  return `${quoteIdentifier(column.typeSchema)}.${quoteIdentifier(base)}${array}`;
}

function columnDefinition(column: SnapshotColumn, primaryKey: boolean): string {
  const notNull = column.notNull || column.primaryKey || primaryKey ? ' not null' : '';
  const value = column.default === undefined ? '' : ` default ${column.default}`;
  return `${quoteIdentifier(column.name)} ${columnType(column)}${notNull}${value}`;
}

function indexColumn(column: SnapshotIndexColumn): string {
  const target = column.isExpression
    ? `(${column.expression})`
    : quoteIdentifier(column.expression);
  const opclass = column.opclass ? ` ${column.opclass}` : '';
  const nulls = column.nulls ? ` nulls ${column.nulls}` : '';
  return `${target}${opclass}${column.asc ? ' asc' : ' desc'}${nulls}`;
}

function policyRoles(roles: string[] | undefined): string {
  const named = roles?.length ? roles : [PUBLIC];
  return named.map(role => (ROLE_KEYWORDS.has(role) ? role : quoteIdentifier(role))).join(', ');
}

function tableStatements(table: SnapshotTable): TwinStatement[] {
  const parts = (name: string) => [PUBLIC, table.name, name];
  const inCompositeKey = new Set(
    Object.values(table.compositePrimaryKeys ?? {}).flatMap(key => key.columns)
  );
  const columns = Object.values(table.columns).map(column =>
    columnDefinition(column, inCompositeKey.has(column.name))
  );
  const statements: TwinStatement[] = [
    {
      key: factKey('relation', [PUBLIC, table.name]),
      sql: `create table ${twin(table.name)} (${columns.join(', ')})`,
    },
  ];
  for (const check of Object.values(table.checkConstraints ?? {})) {
    statements.push({
      key: factKey('check', parts(check.name)),
      sql: `alter table ${twin(table.name)} add constraint ${quoteIdentifier(check.name)} check (${check.value})`,
    });
  }
  for (const index of Object.values(table.indexes ?? {})) {
    const where = index.where ? ` where (${index.where})` : '';
    statements.push({
      key: factKey('index', parts(index.name)),
      sql: `create ${index.isUnique ? 'unique ' : ''}index ${quoteIdentifier(index.name)} on ${twin(table.name)} using ${index.method ?? 'btree'} (${index.columns.map(indexColumn).join(', ')})${where}`,
    });
  }
  for (const policy of Object.values(table.policies ?? {})) {
    const using = policy.using === undefined ? '' : ` using (${policy.using})`;
    const check = policy.withCheck === undefined ? '' : ` with check (${policy.withCheck})`;
    statements.push({
      key: factKey('policy', parts(policy.name)),
      sql: `create policy ${quoteIdentifier(policy.name)} on ${twin(table.name)} as ${policy.as ?? 'permissive'} for ${policy.for ?? 'all'} to ${policyRoles(policy.to)}${using}${check}`,
    });
  }
  return statements;
}

/** The statements that build the twin of the declared schema in TWIN_SCHEMA. */
export function twinStatements(snapshot: DrizzleSnapshot): TwinStatement[] {
  assertModelled(snapshot);
  const statements: TwinStatement[] = [
    { key: factKey('schema', [TWIN_SCHEMA]), sql: `create schema ${quoteIdentifier(TWIN_SCHEMA)}` },
  ];
  for (const table of Object.values(snapshot.tables)) statements.push(...tableStatements(table));
  // A view the snapshot declares as existing states its columns only; its body is SQL-managed.
  for (const view of Object.values(snapshot.views ?? {})) {
    const columns = Object.values(view.columns).map(column => columnDefinition(column, false));
    statements.push({
      key: factKey('relation', [PUBLIC, view.name]),
      sql: `create table ${twin(view.name)} (${columns.join(', ')})`,
    });
  }
  return statements;
}

// PostgreSQL's makeObjectName: the table part is shortened so that `_pkey` fits in 63 bytes.
function primaryKeyName(table: string): string {
  const bytes = Buffer.from(table, 'utf8');
  const kept = bytes.length + 5 > 63 ? bytes.subarray(0, 58).toString('utf8') : table;
  return `${kept}_pkey`;
}

const ACTION = (value: string | undefined) => (value ?? 'no action').toLowerCase();

type SetFact = (kind: string, parts: unknown[], value: string) => void;

function tableStructure(table: SnapshotTable, set: SetFact): void {
  set('relation', [PUBLIC, table.name], 'table');
  // Drizzle states row-level security only when it manages it; false means "not managed here".
  if (table.isRLSEnabled) set('rls', [PUBLIC, table.name], 'enabled');
  const single = Object.values(table.columns).filter(column => column.primaryKey);
  if (single.length > 0) {
    const columns = JSON.stringify(single.map(column => column.name));
    set('pk', [PUBLIC, table.name], `${primaryKeyName(table.name)} ${columns}`);
  }
  for (const key of Object.values(table.compositePrimaryKeys ?? {})) {
    set('pk', [PUBLIC, table.name], `${key.name} ${JSON.stringify(key.columns)}`);
  }
  for (const key of Object.values(table.uniqueConstraints ?? {})) {
    const nulls = key.nullsNotDistinct ? ' nulls not distinct' : '';
    set('unique', [PUBLIC, table.name, key.name], `${JSON.stringify(key.columns)}${nulls}`);
  }
  for (const key of Object.values(table.foreignKeys ?? {})) {
    set(
      'fk',
      [PUBLIC, table.name, key.columnsFrom, key.schemaTo || PUBLIC, key.tableTo, key.columnsTo],
      `delete=${ACTION(key.onDelete)} update=${ACTION(key.onUpdate)} match=s`
    );
  }
}

/** The facts the snapshot states as structure, in the keys the catalog reader produces. */
export function structuralFacts(snapshot: DrizzleSnapshot): Map<string, string> {
  assertModelled(snapshot);
  const facts = new Map<string, string>([[factKey('schema', [PUBLIC]), 'schema']]);
  const set: SetFact = (kind, parts, value) => {
    const key = factKey(kind, parts);
    if (facts.has(key)) throw new Error(`the snapshot declares ${key} twice`);
    facts.set(key, value);
  };
  for (const table of Object.values(snapshot.tables)) tableStructure(table, set);
  for (const value of Object.values(snapshot.enums)) {
    set('enum', [value.schema || PUBLIC, value.name], JSON.stringify(value.values));
  }
  for (const view of Object.values(snapshot.views ?? {})) {
    set('relation', [PUBLIC, view.name], 'view');
  }
  return facts;
}

/** The kinds the twin renders; other twin facts (its own relation, schema) are not declarations. */
export const RENDERED_KINDS = new Set(['column', 'default', 'check', 'index', 'policy']);
