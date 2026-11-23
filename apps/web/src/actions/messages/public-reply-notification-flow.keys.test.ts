import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as schema from '@interdomestik/database/schema';
import { getTableColumns } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { tables } from './public-reply-notification-flow.data';
import { NOT_MODELLED, UNIQUE_KEYS } from './public-reply-notification-flow.keys';

const registry = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../../scripts/ci/sql-managed-objects.json'),
    'utf8'
  )
) as { objects: { key: string; value: string }[] };

/** The column keys (sorted property names) and partial and expression unique indexes of a table. */
function schemaKeys(table: PgTable) {
  const property = new Map(
    Object.entries(getTableColumns(table)).map(([name, c]) => [c.name, name])
  );
  const names = (columns: { name: string }[]) =>
    columns
      .map(column => property.get(column.name) ?? `?${column.name}`)
      .sort()
      .join(',');
  const config = getTableConfig(table);
  const columns = new Set<string>();
  const partial: string[] = [];
  const expressions: string[] = [];
  for (const column of config.columns)
    if (column.primary || column.isUnique) columns.add(names([column]));
  for (const key of [...config.primaryKeys, ...config.uniqueConstraints])
    columns.add(names(key.columns));
  for (const index of config.indexes.filter(candidate => candidate.config.unique)) {
    const parts = index.config.columns;
    if (index.config.where) partial.push(index.config.name ?? '?');
    else if (parts.every(part => 'name' in part)) columns.add(names(parts as { name: string }[]));
    else expressions.push(index.config.name ?? '?');
  }
  for (const entry of registry.objects) {
    if (!entry.key.startsWith('index ') || !entry.value.startsWith('unique')) continue;
    const [, tableName, indexName] = JSON.parse(entry.key.slice('index '.length)) as string[];
    if (tableName === config.name) expressions.push(indexName);
  }
  return { columns, partial: partial.sort(), expressions: expressions.sort() };
}

describe('reply-flow fixture unique keys', () => {
  it.each(Object.keys(tables))('%s models every unique key of the schema and registry', name => {
    const table = (schema as unknown as Record<string, PgTable>)[name];
    const actual = schemaKeys(table);
    const declared = UNIQUE_KEYS[name] ?? [];
    expect(
      new Set(declared.flatMap(key => (key.columns ? [[...key.columns].sort().join(',')] : []))),
      'column keys'
    ).toEqual(actual.columns);
    expect(
      declared
        .filter(key => key.columns === null)
        .map(key => key.name)
        .sort(),
      'expression keys'
    ).toEqual(actual.expressions);
    expect([...((NOT_MODELLED as Record<string, readonly string[]>)[name] ?? [])].sort()).toEqual(
      actual.partial
    );
  });
});
