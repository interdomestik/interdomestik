import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  applyReleaseJournal,
  readReleaseJournal,
  releaseConnection,
  verifiedReleaseLedger,
} from '../../src/release-journal-ledger';
import { inspectReleaseSponsorAcl } from '../../src/release-sponsor-acl';
import { sponsorRuntimeRole } from '../../src/release-sponsor-checkpoint';
import { runSequentially } from '../in-order';
import { quoteIdentifier } from '../rls-test-connection';
import type { ScratchClient } from './scratch-database';

type Acl = Awaited<ReturnType<typeof inspectReleaseSponsorAcl>>;

function columnRollbackStatements(
  table: Acl[number],
  migrated: Acl[number],
  quoted: string,
  runtime: string
): string[] {
  const statements = [];
  for (const [position, column] of table.columns.entries()) {
    const effective = migrated.columns[position].effective;
    const name = quoteIdentifier(column.name);
    for (const addition of effective.filter(p => !column.effective.includes(p))) {
      statements.push(`REVOKE ${addition} (${name}) ON ${quoted} FROM ${runtime} RESTRICT`);
    }
    for (const removal of column.effective.filter(p => !effective.includes(p))) {
      // The scratch preimage records only direct owner grants with no grant option.
      assert.equal(removal, 'UPDATE');
      assert.match(column.acl ?? '', /interdomestik_runtime_rls=w\//u);
      statements.push(`GRANT UPDATE (${name}) ON ${quoted} TO ${runtime}`);
    }
  }
  return statements;
}

export async function proveForwardAclRollback(
  client: ScratchClient,
  migrationsFolder: string,
  before: Acl,
  after: Acl
) {
  const journal = readReleaseJournal(migrationsFolder);
  const runtime = quoteIdentifier(sponsorRuntimeRole);
  const statements = [];
  for (const [index, table] of before.entries()) {
    const migrated = after[index];
    assert.equal(table.relation, migrated.relation);
    assert.deepEqual(table.effectiveTable, migrated.effectiveTable);
    const quoted = `public.${quoteIdentifier(table.relation)}`;
    statements.push(...columnRollbackStatements(table, migrated, quoted, runtime));
    for (const trigger of migrated.triggers.filter(
      t => !table.triggers.some(x => x.name === t.name)
    )) {
      if (table.columns.find(column => column.name === 'id')?.effective.includes('UPDATE')) {
        continue; // The lock-only ACL remains on the checkpoint relations.
      }
      statements.push(`DROP TRIGGER ${quoteIdentifier(trigger.name)} ON ${quoted}`);
    }
  }
  assert.ok(statements.length > 0);

  const handle = await client.reserve();
  const sql = releaseConnection(handle, client.options);
  try {
    const priorLedger = await verifiedReleaseLedger(sql, journal);
    const forward = {
      tag: 'wp16_fixture_acl_rollback',
      sql: statements,
      hash: createHash('sha256').update(statements.join(';\n')).digest('hex'),
      folderMillis: journal[journal.length - 1].folderMillis + 1,
      bps: true,
    };
    const rollbackJournal = [...journal, forward];
    await applyReleaseJournal(drizzle(sql)._.session, migrationsFolder, rollbackJournal);
    const ledger = await verifiedReleaseLedger(sql, rollbackJournal);
    assert.deepEqual(ledger.slice(0, -1), priorLedger);
    assert.equal(ledger.length, priorLedger.length + 1);
    const restored = await inspectReleaseSponsorAcl(sql);
    const claimGuard = before
      .find(table => table.relation === 'claim')
      ?.triggers.find(trigger => trigger.name === 'claim_intake_category_guard');
    assert.ok(claimGuard);
    assert.equal(claimGuard.enabled, 'O');
    assert.deepEqual(
      restored
        .find(table => table.relation === 'claim')
        ?.triggers.find(t => t.name === claimGuard.name),
      claimGuard
    );
    for (const [index, table] of restored.entries()) {
      const expected = before[index];
      assert.equal(table.relation, expected.relation);
      assert.equal(table.tableAcl, expected.tableAcl);
      assert.deepEqual(table.effectiveTable, expected.effectiveTable);
      assert.deepEqual(table.columns, expected.columns);
      const guarded = ['membership_plans', 'claim_transition_evidence'].includes(table.relation);
      assert.deepEqual(table.triggers, guarded ? after[index].triggers : expected.triggers);
    }
  } finally {
    sql.release();
  }
  await client.begin(async tx => {
    await tx`set local role ${tx(sponsorRuntimeRole)}`;
    await runSequentially(['membership_plans', 'claim_transition_evidence'], async relation => {
      await assert.rejects(
        tx.savepoint(sp => sp`update ${sp(relation)} set id = 'unused-wp16-id' where false`),
        (error: unknown) => (error as { code?: string }).code === '23514'
      );
    });
  });
}
