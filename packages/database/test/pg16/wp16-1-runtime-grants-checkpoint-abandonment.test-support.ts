import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { DisposableClient } from '../../src/disposable-client';
import { inspectSponsorCheckpoint, sponsorRuntimeRole } from '../../src/release-sponsor-checkpoint';
import {
  abandonSponsorCheckpoint,
  runSponsorReleaseMigrations,
} from '../../src/release-sponsor-migrations';
import { runSequentially } from '../in-order';
import {
  migrationCause,
  scratchOptions,
  withGrantsScratch,
} from './wp16-1-runtime-grants.test-support';

async function inspectScratchCheckpoint(client: DisposableClient) {
  const reserved = await client.reserve();
  try {
    return await inspectSponsorCheckpoint(reserved);
  } finally {
    reserved.release();
  }
}

export async function testCheckpointAbandonment(
  t: TestContext,
  maintenance: DisposableClient
): Promise<void> {
  await t.test(
    'closed 0104 abandonment restores only its ACL delta and consumes the attempt once',
    async () => {
      await withGrantsScratch(async (client, database) => {
        const { options, checkpoint } = scratchOptions(database);
        await assert.rejects(
          runSponsorReleaseMigrations(client, {
            ...options,
            async recordCheckpoint(evidence) {
              await options.recordCheckpoint(evidence);
              if (evidence.phase === 'checkpoint-checked')
                throw new Error('abort checkpoint after recording');
            },
          }),
          /abort checkpoint after recording/u
        );
        await client`grant update ("updatedAt") on public.claim to ${client(sponsorRuntimeRole)}`;
        await client`create table public.notification_deliveries (test_blocker int)`;
        await runSequentially([0, 1], async () => {
          await assert.rejects(
            runSponsorReleaseMigrations(client, options),
            (error: unknown) => migrationCause(error)?.code === '42P07'
          );
        });
        const [abortedBefore, abortedChecked, before, verified, retryBefore, retryChecked] =
          checkpoint;
        assert.equal(before.attemptId, verified.attemptId);
        assert.notEqual(verified.attemptId, retryChecked.attemptId);
        assert.deepEqual(retryBefore.checks, verified.checks);
        assert.deepEqual(retryChecked.checks, verified.checks);
        assert.deepEqual(abortedChecked.checks, verified.checks);
        assert.deepEqual(
          before.checks.filter(row => row.direct.length),
          [before.checks[0]]
        );
        assert.equal(before.checks[0].relation, 'claim');
        await assert.rejects(
          abandonSponsorCheckpoint(client, options, {
            before: abortedBefore,
            verified: abortedChecked,
          }),
          /requires a committed checkpoint attempt/u
        );
        await assert.rejects(
          abandonSponsorCheckpoint(client, options, { before, verified: retryChecked }),
          /requires the recorded attempt and its verified 0104 ledger/u
        );
        await assert.rejects(
          abandonSponsorCheckpoint(
            client,
            {
              ...options,
              async recordCheckpoint(evidence) {
                await options.recordCheckpoint(evidence);
                throw new Error('reversal intent recording failed after persisting');
              },
            },
            { before, verified }
          ),
          /reversal intent recording failed after persisting/u
        );
        const rolledBack = checkpoint.at(-1);
        assert.ok(rolledBack?.phase === 'checkpoint-reversal-pending');
        assert.notEqual(rolledBack.reversalId, before.attemptId);
        const [aborted] = await client<{ status: string }[]>`
                  select pg_catalog.pg_xact_status(${rolledBack.reversalId}::text::pg_catalog.xid8) as status
                `;
        assert.equal(aborted.status, 'aborted');
        assert.deepEqual(await inspectScratchCheckpoint(client), verified.checks);

        const delayedEvidence: typeof checkpoint = [];
        await assert.rejects(
          abandonSponsorCheckpoint(
            client,
            {
              ...options,
              async recordCheckpoint(evidence) {
                delayedEvidence.push(evidence);
                throw new Error('reversal intent append delayed');
              },
            },
            { before, verified }
          ),
          /reversal intent append delayed/u
        );
        const [delayedIntent] = delayedEvidence;
        assert.ok(delayedIntent?.phase === 'checkpoint-reversal-pending');
        const [delayedReversal] = await client<{ status: string }[]>`
                  select pg_catalog.pg_xact_status(${delayedIntent.reversalId}::text::pg_catalog.xid8) as status
                `;
        assert.equal(delayedReversal.status, 'aborted');

        await assert.rejects(
          abandonSponsorCheckpoint(
            client,
            {
              ...options,
              async recordCheckpoint(evidence) {
                if (evidence.phase === 'checkpoint-reversed') {
                  // Use a separate session to verify the commit before receipt delivery.
                  const [committed] = await maintenance<{ status: string }[]>`
                            select pg_catalog.pg_xact_status(${evidence.reversalId}::text::pg_catalog.xid8) as status
                          `;
                  assert.equal(committed.status, 'committed');
                  assert.notEqual(evidence.reversalId, evidence.attemptId);
                  throw new Error('reversal receipt publication failed');
                }
                await options.recordCheckpoint(evidence);
              },
            },
            { before, verified }
          ),
          /reversal receipt publication failed/u
        );
        assert.equal(
          checkpoint.some(evidence => evidence.phase === 'checkpoint-reversed'),
          false
        );
        assert.deepEqual(await inspectScratchCheckpoint(client), before.checks);

        // Recreate the same ACL, with an independent grant the later attempt must preserve.
        await client`grant update ("updatedAt") on public."user" to ${client(sponsorRuntimeRole)}`;
        await assert.rejects(
          runSponsorReleaseMigrations(client, options),
          (error: unknown) => migrationCause(error)?.code === '42P07'
        );
        const [laterBefore, laterChecked] = checkpoint.slice(-2);
        assert.notEqual(laterBefore.attemptId, before.attemptId);
        assert.deepEqual(laterChecked.checks, verified.checks);
        assert.equal(laterBefore.checks[1].relation, 'user');
        assert.equal(laterBefore.checks[1].direct.length, 1);
        await assert.rejects(
          abandonSponsorCheckpoint(client, options, { before, verified }),
          /Checkpoint attempt was already reversed/u
        );
        assert.deepEqual(await inspectScratchCheckpoint(client), laterChecked.checks);

        // The older aborted reversal's intent arrives after the committed reversal's intent.
        await options.recordCheckpoint(delayedIntent);
        await assert.rejects(
          abandonSponsorCheckpoint(client, options, { before, verified }),
          /Checkpoint attempt was already reversed/u
        );
        assert.deepEqual(await inspectScratchCheckpoint(client), laterChecked.checks);

        await abandonSponsorCheckpoint(client, options, {
          before: laterBefore,
          verified: laterChecked,
        });
        const pending = checkpoint.at(-2);
        const reversed = checkpoint.at(-1);
        assert.ok(pending?.phase === 'checkpoint-reversal-pending');
        assert.ok(reversed?.phase === 'checkpoint-reversed');
        assert.equal(reversed.attemptId, laterBefore.attemptId);
        assert.notEqual(reversed.reversalId, laterBefore.attemptId);
        assert.equal(reversed.reversalId, pending.reversalId);
        assert.deepEqual(reversed.checks, laterBefore.checks);
        assert.deepEqual(await inspectScratchCheckpoint(client), laterBefore.checks);
        assert.deepEqual(reversed.target.ledger, laterBefore.target.ledger);
        await assert.rejects(
          abandonSponsorCheckpoint(client, options, {
            before: laterBefore,
            verified: laterChecked,
          }),
          /Checkpoint attempt was already reversed/u
        );
      });
    }
  );
}
