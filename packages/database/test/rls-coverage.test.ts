import assert from 'node:assert/strict';
import test from 'node:test';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

type CoverageRow = {
  table_name: string;
  rls_enabled: boolean | null;
};

function getExemptTables(): Set<string> {
  return new Set(
    (process.env.RLS_COVERAGE_EXEMPT_TABLES ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
  );
}

test('reports RLS coverage for all tenant-scoped tables', async t => {
  const requireCoverage = process.env.REQUIRE_RLS_COVERAGE === '1';

  if (!process.env.DATABASE_URL) {
    if (requireCoverage) {
      assert.fail('RLS coverage check requires DATABASE_URL when REQUIRE_RLS_COVERAGE=1.');
    }
    t.skip('DATABASE_URL is required for RLS coverage reporting');
    return;
  }

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  try {
    const rows = await db.execute<CoverageRow>(sql`
      with tenant_tables as (
        select table_name
        from information_schema.columns
        where table_schema = 'public'
          and column_name = 'tenant_id'
      )
      select
        tt.table_name,
        coalesce(c.relrowsecurity, false) as rls_enabled
      from tenant_tables tt
      left join pg_class c
        on c.relname = tt.table_name
       and c.relkind = 'r'
      left join pg_namespace n
        on n.oid = c.relnamespace
       and n.nspname = 'public'
      order by tt.table_name
    `);

    const exemptTables = getExemptTables();
    const missing = rows
      .filter(row => !row.rls_enabled && !exemptTables.has(row.table_name))
      .map(row => row.table_name);

    const enabledCount = rows.filter(row => row.rls_enabled).length;
    const total = rows.length;
    const percentage = total === 0 ? '100.00' : ((enabledCount / total) * 100).toFixed(2);

    console.log(
      `RLS_COVERAGE total=${total} enabled=${enabledCount} missing=${missing.length} pct=${percentage}`
    );
    if (missing.length > 0) {
      console.log(`RLS_MISSING_TABLES ${missing.join(',')}`);
    }

    if (requireCoverage) {
      assert.deepEqual(
        missing,
        [],
        `Missing RLS on tenant-scoped tables:\n${missing.map(name => `- ${name}`).join('\n')}`
      );
    }
  } finally {
    await client.end({ timeout: 5 });
  }
});
