import assert from 'node:assert/strict';
import test from 'node:test';
import { optOutTokenHash } from '../../../domain-membership-billing/src/sponsors/roster-crypto';
import type { inspectReleaseSponsorAcl } from '../../src/release-sponsor-acl';
import { runSponsorReleaseMigrations } from '../../src/release-sponsor-migrations';
import { seedSponsorScope, uid } from '../sponsor-seed.test-support';
import { proveSponsorRuntimeDenials } from './wp16-1-runtime-grants-access';
import { testCheckpointAbandonment } from './wp16-1-runtime-grants-checkpoint-abandonment.test-support';
import { proveForwardAclRollback } from './wp16-1-runtime-grants-rollback';
import { proveSponsorOptOut } from './wp16-1-runtime-grants-opt-out';
import {
  journal,
  migrationCause,
  migrationsFolder,
  prefix,
  scratchOptions,
  sponsorGrantsIndex,
  stageJournal,
  withGrantsRole,
  withGrantsScratch,
} from './wp16-1-runtime-grants.test-support';

function withoutGrantor(acl: Awaited<ReturnType<typeof inspectReleaseSponsorAcl>>) {
  return acl.map(({ relation, effectiveTable, columns }) => ({
    relation,
    effectiveTable,
    columns: columns.map(({ name, effective }) => ({ name, effective })),
  }));
}

test('WP-16.1 release builds and reconciles the PG16 runtime grant journal', async t => {
  await withGrantsRole(t, async maintenance => {
    let freshAcl: ReturnType<typeof withoutGrantor>;
    await t.test(
      'fresh build retries the checkpoint and suffix, then admits restricted operations',
      async () => {
        await withGrantsScratch(async (client, database) => {
          const { options, checkpoint, acl } = scratchOptions(database);
          await assert.rejects(
            runSponsorReleaseMigrations(client, {
              ...options,
              async recordCheckpoint(evidence) {
                if (evidence.phase === 'checkpoint-checked')
                  throw new Error('injected checkpoint recording failure');
              },
            }),
            /injected checkpoint recording failure/u
          );
          await client`create table public.notification_deliveries (test_blocker int)`;
          await assert.rejects(
            runSponsorReleaseMigrations(client, options),
            (error: unknown) => migrationCause(error)?.code === '42P07'
          );
          await client`drop table public.notification_deliveries`;
          const [before, verified] = checkpoint;
          assert.equal(before.checks.filter(row => row.direct.length > 0).length, 0);
          await assert.rejects(
            runSponsorReleaseMigrations(client, {
              ...options,
              async recordAcl({ phase, target }) {
                if (phase === 'before-trailing') {
                  assert.equal(target.ledger.length, sponsorGrantsIndex);
                  throw new Error('pre-0111 recording failed');
                }
              },
            }),
            /pre-0111 recording failed/u
          );
          const [, , retryBefore, retryVerified] = checkpoint;
          assert.notEqual(retryBefore.attemptId, before.attemptId);
          assert.deepEqual(retryBefore.checks, verified.checks);
          assert.deepEqual(retryVerified.checks, verified.checks);
          const finished = await runSponsorReleaseMigrations(client, options);
          assert.equal(checkpoint.length, 4);
          assert.deepEqual(finished.ledger.slice(0, prefix), before.target.ledger);
          assert.equal(finished.ledger.length, journal.length);
          const final = acl.find(entry => entry.phase === 'after-trailing');
          assert.ok(final);
          freshAcl = withoutGrantor(final.acl);
          const token = uid();
          const a = await seedSponsorScope(client, undefined, optOutTokenHash(token));
          const b = await seedSponsorScope(client);
          await proveSponsorRuntimeDenials(client, a, b);
          await proveSponsorOptOut(client, database, a, b, token);
        });
      }
    );

    await testCheckpointAbandonment(t, maintenance);

    await t.test('fresh rollback preserves the 0106 guard and ACL', async () => {
      await withGrantsScratch(async (client, database) => {
        const { options, acl } = scratchOptions(database);
        const finished = await runSponsorReleaseMigrations(client, options);
        const [, before, after] = acl;
        assert.equal(before.phase, 'before-trailing');
        assert.equal(after.phase, 'after-trailing');
        assert.deepEqual(before.target.ledger, finished.ledger.slice(0, sponsorGrantsIndex));
        assert.deepEqual(after.target.ledger, finished.ledger.slice(0, sponsorGrantsIndex + 1));
        await proveForwardAclRollback(client, migrationsFolder, before.acl, after.acl);
      });
    });

    await t.test(
      'verified legacy prefix converges on all checkpoint and sponsor relations',
      async () => {
        await withGrantsScratch(async (client, database) => {
          await stageJournal(client, 'legacy');
          const { options, acl, checkpoint } = scratchOptions(database);
          const finished = await runSponsorReleaseMigrations(client, {
            ...options,
            path: 'forward',
          });
          assert.deepEqual(finished.ledger.slice(0, sponsorGrantsIndex), acl[0].target.ledger);
          assert.deepEqual(checkpoint, []);
          assert.deepEqual(withoutGrantor(acl[1].acl), freshAcl);
          await proveForwardAclRollback(client, migrationsFolder, acl[0].acl, acl[1].acl);
        });
      }
    );
  });
});
