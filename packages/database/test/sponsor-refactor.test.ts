import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { sponsors } from '../src/schema/sponsors';
import { lockSponsorEntryIdentity, lockSponsorPerson } from '../src/sponsor-locks';
import type { TenantTransaction } from '../src/tenant';

const dialect = new PgDialect();
const migration = readFileSync(
  fileURLToPath(new URL('../drizzle/0099_acq3b_sponsor_seats.sql', import.meta.url)),
  'utf8'
);

describe('sponsor schema and lock refactors', () => {
  it('keeps the nonblank legal-name constraint aligned in schema, migration and snapshot', () => {
    const constraint = getTableConfig(sponsors).checks.find(
      check => check.name === 'sponsors_legal_name_check'
    );
    expect(constraint).toBeDefined();
    const expression = dialect.sqlToQuery(constraint!.value).sql;
    expect(expression).toBe('length(btrim("sponsors"."legal_name")) > 0');
    expect(migration).toContain(`CHECK (${expression})`);
    const snapshot = JSON.parse(
      readFileSync(new URL('../drizzle/meta/0099_snapshot.json', import.meta.url), 'utf8')
    );
    expect(
      snapshot.tables['public.sponsors'].checkConstraints.sponsors_legal_name_check.value
    ).toBe(expression);
  });

  it.each([
    [lockSponsorEntryIdentity, 'sponsor-entry:identity'],
    [lockSponsorPerson, 'sponsor-user:identity'],
  ])('keeps each advisory lock namespace and parameterization', async (lock, expected) => {
    const execute = vi.fn().mockResolvedValue(undefined);
    await lock({ execute } as unknown as TenantTransaction, 'identity');
    const query = dialect.sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toBe('select pg_advisory_xact_lock(hashtext($1))');
    expect(query.params).toEqual([expected]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
