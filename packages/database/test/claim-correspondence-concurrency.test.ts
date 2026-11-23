import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type postgres from 'postgres';

import {
  createBases,
  documentInput,
  earlier,
  grantInput,
  insertClaim,
  insertDocument,
  insertEntry,
  insertGrant,
  isolationLevels,
  outboundInput,
  past,
  restricted,
  revoke,
  unique,
  withRegisterDb,
  type Connection,
} from './claim-correspondence.fixture';

type Tx = postgres.TransactionSql;
type Scope = Parameters<typeof restricted>[2];

async function blockedBy(admin: postgres.Sql, pending: number, holder: number) {
  const until = Date.now() + 4_000;
  while (Date.now() < until) {
    const [{ blocked }] = await admin<{ blocked: boolean }[]>`
      select ${holder} = any(pg_blocking_pids(${pending})) as blocked`;
    if (blocked) return;
    await sleep(20);
  }
  assert.fail(`Expected connection ${pending} to block on connection ${holder}`);
}

async function overlap(
  { admin, runtime, peer }: Connection,
  first: (tx: Tx) => Promise<unknown>,
  second: (tx: Tx) => Promise<unknown>,
  scope: Scope = {}
) {
  let next: Promise<PromiseSettledResult<void>> | undefined;
  try {
    await restricted(
      runtime,
      async tx => {
        const [{ pid: holder }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
        await first(tx);
        let signal!: (pid: number) => void;
        const started = new Promise<number>(resolve => {
          signal = resolve;
        });
        next = restricted(
          peer,
          async other => {
            const [{ pid }] = await other<{ pid: number }[]>`select pg_backend_pid() as pid`;
            signal(pid);
            await second(other);
          },
          scope
        ).then(
          value => ({ status: 'fulfilled', value }) as const,
          reason => ({ status: 'rejected', reason }) as const
        );
        const contender = await Promise.race([started, next.then(() => -1)]);
        assert.notEqual(contender, -1, 'the contender opened a second restricted transaction');
        assert.notEqual(contender, holder);
        await blockedBy(admin, contender, holder);
      },
      scope
    );
    assert.ok(next);
    const outcome = await next;
    if (outcome.status === 'rejected') throw outcome.reason;
    return outcome.value;
  } finally {
    await next;
  }
}

test('WP-12 concurrent correspondence and authority decisions', async t => {
  await withRegisterDb(t, async connections => {
    const { admin, runtime } = connections;
    await t.test(
      'direct revocation and authority insertion share the claim lock in both orders',
      async () => {
        for (const revokeFirst of [true, false]) {
          const claim = await insertClaim(admin);
          const doc = await restricted(runtime, tx => insertDocument(tx, documentInput(claim)));
          const grant = await restricted(runtime, tx => insertGrant(tx, grantInput(claim, doc)));
          const next = grantInput(claim, doc, 'signed_assignment');
          // Bounds stay in the database's microsecond precision and are compared there.
          const [{ mark: before }] = await admin<
            { mark: string }[]
          >`select clock_timestamp()::text as mark`;
          const revokeOld = async (tx: Tx) => {
            await revoke(tx, grant, earlier);
          };
          const insertNext = async (tx: Tx) => {
            await insertGrant(tx, next);
          };
          await overlap(
            connections,
            revokeFirst ? revokeOld : insertNext,
            revokeFirst ? insertNext : revokeOld
          );
          const [{ mark: after }] = await admin<
            { mark: string }[]
          >`select clock_timestamp()::text as mark`;
          const rows = await restricted(
            runtime,
            tx => tx<{ id: string; revoked_at: Date | null; stamped_inside: boolean | null }[]>`
          select id, revoked_at,
            revoked_at between ${before}::timestamptz and ${after}::timestamptz as stamped_inside
          from claim_authorities where claim_id = ${claim.id}`
          );
          assert.equal(rows.length, 2);
          assert.equal(rows.find(row => row.id === grant.id)?.stamped_inside, true);
          assert.equal(rows.find(row => row.id === next.id)?.revoked_at, null);
        }
      }
    );

    await t.test(
      'same-kind grants are refused before and after revocation and at both isolation levels',
      async () => {
        const violation = unique('claim_authorities_claim_kind_uq');
        for (const isolation of isolationLevels) {
          const claim = await insertClaim(admin);
          const doc = await restricted(runtime, tx => insertDocument(tx, documentInput(claim)));
          const first = grantInput(claim, doc);
          const second = grantInput(claim, doc);
          await assert.rejects(
            overlap(
              connections,
              tx => insertGrant(tx, first),
              tx => insertGrant(tx, second),
              { isolation }
            ),
            violation
          );
          await assert.rejects(
            restricted(runtime, tx => insertGrant(tx, second), { isolation }),
            violation
          );
          await restricted(runtime, tx => revoke(tx, first));
          await assert.rejects(
            restricted(runtime, tx => insertGrant(tx, second), { isolation }),
            violation
          );
          await assert.rejects(
            restricted(runtime, tx => revoke(tx, first)),
            { code: 'P1205' }
          );
        }
      }
    );

    await t.test(
      'record and revoke serialize in both orders on separate restricted connections',
      async () => {
        for (const revokeFirst of [true, false]) {
          const claim = await insertClaim(admin);
          const bases = await restricted(runtime, async tx => {
            const doc = await insertDocument(tx, documentInput(claim));
            return createBases(tx, claim, doc);
          });
          const entry = outboundInput(claim, bases);
          const record = async (tx: Tx) => {
            await insertEntry(tx, entry);
          };
          const revokeBasis = async (tx: Tx) => {
            await revoke(tx, bases.recovery);
          };
          if (revokeFirst) {
            await assert.rejects(overlap(connections, revokeBasis, record), {
              code: 'P1202',
              message: 'Required outbound authorities are invalid',
            });
          } else {
            await overlap(connections, record, revokeBasis);
          }
          const rows = await restricted(
            runtime,
            tx => tx<{ decided_at: Date }[]>`
          select decided_at from claim_correspondence where id = ${entry.id}`
          );
          assert.equal(rows.length, revokeFirst ? 0 : 1);
          const [revocation] = await restricted(
            runtime,
            tx => tx<{ revoked_at: Date }[]>`
          select revoked_at from claim_authorities where id = ${bases.recovery.id}`
          );
          assert.ok(revocation.revoked_at > new Date(past));
          if (rows.length) assert.ok(rows[0].decided_at <= revocation.revoked_at);
          await assert.rejects(
            restricted(runtime, tx => insertEntry(tx, outboundInput(claim, bases))),
            { code: 'P1202' }
          );
        }
      }
    );
  });
});
