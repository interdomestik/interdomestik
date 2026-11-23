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

const sorted = (values: readonly string[]) => [...values].sort((a, b) => a.localeCompare(b));

/** The top-level comma-separated parts of a registry index rendering `unique btree (...)`. */
function registryIndexParts(value: string): string[] {
  const body = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') depth--;
    current += char;
  }
  parts.push(current.trim());
  return parts;
}

/** The column keys (sorted property names) and partial and expression unique indexes of a table. */
function schemaKeys(table: PgTable) {
  const property = new Map(
    Object.entries(getTableColumns(table)).map(([name, c]) => [c.name, name])
  );
  const names = (columns: { name: string }[]) =>
    sorted(columns.map(column => property.get(column.name) ?? `?${column.name}`)).join(',');
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
    if (tableName !== config.name) continue;
    // `unique btree (a, b)` is a column key; any other part makes it an expression key.
    const parts = registryIndexParts(entry.value);
    if (parts.every(part => /^[a-z_][a-z0-9_]*$/u.test(part)))
      columns.add(names(parts.map(name => ({ name }))));
    else expressions.push(indexName);
  }
  return { columns, partial: sorted(partial), expressions: sorted(expressions) };
}

describe('reply-flow fixture unique keys', () => {
  it.each(Object.keys(tables))('%s models every unique key of the schema and registry', name => {
    const table = (schema as unknown as Record<string, PgTable>)[name];
    const actual = schemaKeys(table);
    const declared = UNIQUE_KEYS[name] ?? [];
    expect(
      new Set(declared.flatMap(key => (key.columns ? [sorted(key.columns).join(',')] : []))),
      'column keys'
    ).toEqual(actual.columns);
    expect(
      sorted(declared.filter(key => key.columns === null).map(key => key.name)),
      'expression keys'
    ).toEqual(actual.expressions);
    expect(sorted((NOT_MODELLED as Record<string, readonly string[]>)[name] ?? [])).toEqual(
      actual.partial
    );
  });
});
