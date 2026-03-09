import assert from 'node:assert/strict';
import test from 'node:test';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

type CriticalRlsRow = {
  relname: string;
  relrowsecurity: boolean | null;
};

const CRITICAL_TABLES = ['claim', 'claim_messages', 'documents', 'user'] as const;

test('critical tables keep row level security enabled', async t => {
  if (!process.env.DATABASE_URL) {
    t.skip('DATABASE_URL is required for critical-table RLS verification');
    return;
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  try {
    const rows = await db.execute<CriticalRlsRow>(sql`
      select relname, relrowsecurity
      from pg_class
      where relname in ('claim', 'claim_messages', 'documents', 'user')
      order by relname
    `);

    assert.deepEqual(
      rows.map(row => row.relname),
      ['claim', 'claim_messages', 'documents', 'user'],
      'expected the D08 critical-table set to exist in pg_class'
    );
    assert.deepEqual(
      rows.map(row => row.relrowsecurity),
      [true, true, true, true],
      'expected relrowsecurity = true for the D08 critical-table set'
    );
  } finally {
    await client.end({ timeout: 5 });
  }
});
