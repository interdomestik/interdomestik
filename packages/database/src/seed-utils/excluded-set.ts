import { getTableColumns, sql, type Table } from 'drizzle-orm';

/** Every column but the key takes the incoming value on conflict, so a rerun restores the state. */
export function excludedSet(table: Table, row: Record<string, unknown>) {
  const columns = getTableColumns(table);
  return Object.fromEntries(
    Object.keys(row)
      .filter(key => key !== 'id')
      .map(key => [key, sql.raw(`excluded."${columns[key].name}"`)])
  );
}
