import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';

import { sponsors } from '../src/schema/sponsors';
import { lockSponsorEntryIdentity, lockSponsorPerson } from '../src/sponsor-locks';
import type { TenantTransaction } from '../src/tenant';

const dialect = new PgDialect();
const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('sponsor schema and lock refactors', () => {
  it('keeps the nonblank legal-name rule equivalent in schema, snapshot and migration', () => {
    const constraint = getTableConfig(sponsors).checks.find(
      check => check.name === 'sponsors_legal_name_check'
    );
    assert.ok(constraint);
    const expression = dialect.sqlToQuery(constraint.value).sql;
    // The schema (and its pinned tenant-guard digest) keeps the Drizzle form; the migration states
    // the same rule as a length test. legal_name is NOT NULL, so both reject exactly blank names.
    assert.equal(expression, `btrim("sponsors"."legal_name") <> ''`);
    const snapshot = JSON.parse(read('../drizzle/meta/0099_snapshot.json'));
    assert.equal(
      snapshot.tables['public.sponsors'].checkConstraints.sponsors_legal_name_check.value,
      expression
    );
    const migration = read('../drizzle/0099_acq3b_sponsor_seats.sql');
    assert.ok(migration.includes('CHECK (length(btrim("sponsors"."legal_name")) > 0)'));
    assert.ok(!migration.includes(`CHECK (${expression})`));
  });

  for (const [lock, expected] of [
    [lockSponsorEntryIdentity, 'sponsor-entry:identity'],
    [lockSponsorPerson, 'sponsor-user:identity'],
  ] as const) {
    it(`keeps the ${expected} advisory lock namespace and parameterization`, async () => {
      const calls: SQL[] = [];
      const execute = (query: SQL): Promise<void> => {
        calls.push(query);
        return Promise.resolve();
      };
      await lock({ execute } as unknown as TenantTransaction, 'identity');
      assert.equal(calls.length, 1);
      const query = dialect.sqlToQuery(calls[0]);
      assert.equal(query.sql, 'select pg_advisory_xact_lock(hashtext($1))');
      assert.deepEqual(query.params, [expected]);
    });
  }
});
