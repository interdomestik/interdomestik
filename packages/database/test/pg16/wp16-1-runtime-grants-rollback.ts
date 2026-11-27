import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  applyReleaseJournal,
  releaseConnection,
  verifiedReleaseLedger,
} from '../../src/release-journal-ledger';
import { inspectReleaseSponsorAcl } from '../../src/release-sponsor-acl';
import {
  sponsorRuntimeRole,
  sponsorTrailingTag,
  type ReleaseSql,
} from '../../src/release-sponsor-checkpoint';
import { runSponsorReleaseMigrations } from '../../src/release-sponsor-migrations';
import { runSequentially } from '../in-order';
import { quoteIdentifier } from '../rls-test-connection';
import type { ScratchClient } from './scratch-database';
import {
  journal,
  migrationsFolder,
  scratchOptions,
  stageJournal,
  withGrantsScratch,
} from './wp16-1-runtime-grants.test-support';

type Acl = Awaited<ReturnType<typeof inspectReleaseSponsorAcl>>;

async function rollbackReference(before: Acl, path: 'fresh' | 'forward'): Promise<Acl> {
  return withGrantsScratch(async (client, database) => {
    if (path === 'forward') await stageJournal(client, 'legacy');
    const { options } = scratchOptions(database);
    const stopBeforeSponsorGrants = new Error('reference stops before 0111');
    await assert.rejects(
      runSponsorReleaseMigrations(client, {
        ...options,
        path,
        async recordAcl({ phase, acl }) {
          if (phase === 'before-trailing') {
            assert.deepEqual(acl, before);
            throw stopBeforeSponsorGrants;
          }
        },
      }),
      (error: unknown) => error === stopBeforeSponsorGrants
    );

    const handle = await client.reserve();
    const sql = releaseConnection(handle, client.options);
    try {
      // Replay the suffix so its independent grants and triggers are part of the rollback baseline.
      const referenceJournal = journal.filter(entry => entry.tag !== sponsorTrailingTag);
      await applyReleaseJournal(drizzle(sql)._.session, migrationsFolder, referenceJournal);
      assert.equal(
        (await verifiedReleaseLedger(sql, referenceJournal)).length,
        referenceJournal.length
      );
      return await inspectReleaseSponsorAcl(sql);
    } finally {
      sql.release();
    }
  });
}

async function columnAclItems(sql: ReleaseSql, acl: string | null) {
  if (acl === null) return null;
  return await sql<{ item: string }[]>`
    select item::text as item from pg_catalog.unnest(${acl}::pg_catalog.aclitem[]) as acl(item)
    order by item::text collate "C"
  `;
}

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
  before: Acl,
  after: Acl,
  path: 'fresh' | 'forward'
) {
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

  const reference = await rollbackReference(before, path);
  const handle = await client.reserve();
  const sql = releaseConnection(handle, client.options);
  try {
    const priorLedger = await verifiedReleaseLedger(sql, journal);
    const forward = {
      tag: 'wp16_fixture_acl_rollback',
      sql: statements,
      hash: createHash('sha256').update(statements.join(';\n')).digest('hex'),
      folderMillis: journal.at(-1)!.folderMillis + 1,
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
    assert.equal(restored.length, reference.length);
    for (const [index, table] of restored.entries()) {
      const expected = reference[index];
      assert.equal(table.relation, expected.relation);
      assert.equal(table.tableAcl, expected.tableAcl);
      assert.deepEqual(table.effectiveTable, expected.effectiveTable);
      assert.equal(table.columns.length, expected.columns.length, table.relation);
      await runSequentially(table.columns.entries(), async ([position, column]) => {
        const baseline = expected.columns[position];
        const label = `${table.relation}.${column.name}`;
        assert.equal(column.name, baseline.name, label);
        assert.deepEqual(column.effective, baseline.effective, label);
        if (column.acl !== baseline.acl) {
          // Regranting a legacy privilege can change the position of its ACL item.
          assert.deepEqual(
            await columnAclItems(sql, column.acl),
            await columnAclItems(sql, baseline.acl),
            label
          );
        }
      });
      const retainedGuard = `wp16_${table.relation}_runtime_id_guard`;
      const guarded = ['membership_plans', 'claim_transition_evidence'].includes(table.relation);
      assert.deepEqual(
        table.triggers.filter(trigger => !(guarded && trigger.name === retainedGuard)),
        expected.triggers
      );
      if (guarded) {
        const guard = after[index].triggers.find(trigger => trigger.name === retainedGuard);
        assert.ok(guard);
        assert.deepEqual(
          table.triggers.find(trigger => trigger.name === retainedGuard),
          guard
        );
      }
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
