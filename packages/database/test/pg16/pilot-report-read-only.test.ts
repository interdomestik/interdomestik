// R-13 (WP-04): the pilot branch report reads only. Proved on a scratch database through the real
// reporting path: every way one statement could write is refused, and nothing is written.
//   pnpm db:journal:parity   (the server it needs: scratch-database.ts)
import assert from 'node:assert/strict';
import test from 'node:test';
import { runReadOnlyReport } from '../../src/scripts/pilot-branch-report';
import { scratchServerMissing, withScratchDatabase } from './scratch-database';

const errorCode = (error: unknown) =>
  error instanceof Error && 'code' in error ? String(error.code) : undefined;

test('a report statement cannot write, change the transaction mode or chain a statement', async t => {
  const missing = scratchServerMissing('REQUIRE_JOURNAL_SCHEMA_PARITY');
  if (missing) {
    t.skip(missing);
    return;
  }
  await withScratchDatabase('wp04_report', async client => {
    await client.unsafe('create table report_rows (id int)');
    for (const [statement, code] of [
      ['insert into report_rows values (1)', '25006'],
      ['with gone as (delete from report_rows returning id) select * from gone', '25006'],
      ['update report_rows set id = 2', '25006'],
      ['create table other_rows (id int)', '25006'],
      ['set transaction read write', '25001'],
      ['select 1; insert into report_rows values (1)', '42601'],
    ] as const) {
      await assert.rejects(
        runReadOnlyReport(client, statement, []),
        error => errorCode(error) === code,
        statement
      );
    }
    // Ending the report's transaction early does not let a later statement write: the next
    // report opens its own read-only transaction.
    const ended = await runReadOnlyReport(client, 'commit', []).then(
      () => 'returned',
      error => errorCode(error)
    );
    assert.equal(ended, 'returned');
    await assert.rejects(
      runReadOnlyReport(client, 'insert into report_rows values (3)', []),
      error => errorCode(error) === '25006'
    );
    const rows = await runReadOnlyReport<{ id: number }>(
      client,
      'select id from report_rows where id <> $1::int',
      ['0']
    );
    assert.equal(rows.length, 0);
    const [{ count }] = await client.unsafe('select count(*)::int as count from report_rows');
    assert.equal(count, 0);
  });
});
