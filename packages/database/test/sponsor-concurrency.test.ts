import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import postgres from 'postgres';
import {
  END,
  insert,
  iso,
  MID,
  restricted,
  row,
  START,
  uid,
  update,
  withFixture,
  type Fixture,
  type Tx,
} from './sponsor-test-fixture';

function gate(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
}

async function waitForBlock(
  f: Fixture,
  waiter: number,
  holder: number,
  deadline: number
): Promise<void> {
  const [state] =
    await f.admin`select ${holder}::int = any(pg_blocking_pids(${waiter}::int)) as blocked`;
  if (state?.blocked === true) return;
  assert.ok(
    Date.now() < deadline,
    'Expected PostgreSQL to report the second backend waiting on the first'
  );
  await sleep(20);
  await waitForBlock(f, waiter, holder, deadline);
}

async function lock(tx: Tx, f: Fixture, target: 'sponsors' | 'sponsor_terms'): Promise<void> {
  // Normal term operations lock sponsors first. The term-only case separately isolates the
  // common FOR UPDATE primitive; it is not claimed as the domain's complete lock protocol.
  if (target === 'sponsors') {
    await tx`select id from sponsors where tenant_id = ${f.a.tenant} and id = ${f.a.sponsors} for update`;
  }
  await tx`select id from sponsor_terms where tenant_id = ${f.a.tenant}
    and sponsor_id = ${f.a.sponsors} order by id for update`;
}

async function race(
  f: Fixture,
  target: 'sponsors' | 'sponsor_terms',
  first: (tx: Tx) => Promise<void>,
  second: (tx: Tx) => Promise<void>
): Promise<void> {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const one = postgres(url, { max: 1 });
  const two = postgres(url, { max: 1 });
  const ready = gate();
  const started = gate();
  const release = gate();
  let holder = 0;
  let waiter = 0;
  let secondFinished = false;
  const firstWork = restricted(one, f.a, async tx => {
    const [pid] = await tx`select pg_backend_pid() as pid`;
    holder = Number(pid?.pid);
    await lock(tx, f, target);
    await first(tx);
    ready.release();
    await release.promise;
  });
  // Observe rejections immediately and let finally release/close both clients on every path.
  const firstResult = firstWork.then(
    () => null,
    (error: unknown) => error
  );
  let secondResult: Promise<unknown> = Promise.resolve(null);
  try {
    await Promise.race([ready.promise, firstWork]);
    assert.ok(holder > 0);
    const secondWork = restricted(two, f.a, async tx => {
      const [pid] = await tx`select pg_backend_pid() as pid`;
      waiter = Number(pid?.pid);
      started.release();
      await lock(tx, f, target);
      await second(tx);
      secondFinished = true;
    });
    secondResult = secondWork.then(
      () => null,
      (error: unknown) => error
    );
    await Promise.race([started.promise, secondWork]);
    assert.notEqual(holder, waiter, 'Transactions must use different PostgreSQL backends');
    await waitForBlock(f, waiter, holder, Date.now() + 4000);
    assert.equal(secondFinished, false, 'Waiter must not complete before the holder commits');
    release.release();
    await Promise.all([firstWork, secondWork]);
    assert.equal(secondFinished, true);
  } finally {
    release.release();
    await Promise.all([firstResult, secondResult]);
    await Promise.all([one.end({ timeout: 5 }), two.end({ timeout: 5 })]);
  }
}

test('Concurrent uploads serialize and the waiter sees the committed seat before applying the cap', async t => {
  await withFixture(t, async f => {
    const count = async (tx: Tx): Promise<number> => {
      const [result] = await tx`select count(*)::int as count from sponsor_roster_entries
        where tenant_id = ${f.a.tenant} and term_id = ${f.a.sponsor_terms}`;
      return Number(result?.count);
    };
    let cap = 0;
    await race(
      f,
      'sponsors',
      async tx => {
        const [approved] = await tx`select r.seat_count from sponsor_term_revisions r
        join sponsor_revision_decisions d on d.tenant_id = r.tenant_id and d.revision_id = r.id
        where r.tenant_id = ${f.a.tenant} and r.term_id = ${f.a.sponsor_terms}
        and d.decision = 'approved' order by r.revision desc limit 1`;
        cap = Number(approved?.seat_count);
        assert.equal(cap, 2);
        assert.equal(await count(tx), 1);
        await insert(tx, 'sponsor_roster_entries', row(f.a, 'sponsor_roster_entries', true));
      },
      async tx => {
        const listed = await count(tx);
        assert.equal(listed, 2, 'Read committed statement after lock sees the first upload');
        const wouldExceedCap = listed + 1 > cap;
        assert.equal(wouldExceedCap, true, 'uploadRoster must return conflict here');
        // Cap enforcement is application code, not a migration constraint: do not insert.
      }
    );
    await restricted(f.admin, f.a, async tx => {
      assert.equal(await count(tx), cap);
    });
  });
});

async function successor(f: Fixture): Promise<{ termId: string; revisionId: string }> {
  const term = row(f.a, 'sponsor_terms', true);
  const revisionId = uid();
  await insert(f.admin, 'sponsor_terms', term);
  await insert(f.admin, 'sponsor_term_revisions', {
    ...row(f.a, 'sponsor_term_revisions', true),
    id: revisionId,
    term_id: term.id,
    revision: 1,
  });
  return { termId: String(term.id), revisionId };
}

async function approve(tx: Tx, f: Fixture, revisionId: string): Promise<void> {
  await insert(tx, 'sponsor_revision_decisions', {
    ...row(f.a, 'sponsor_revision_decisions', true),
    revision_id: revisionId,
  });
}

async function hasSuccessor(tx: Tx, f: Fixture): Promise<boolean> {
  const result = await tx`select t.id from sponsor_terms t
    join sponsor_term_revisions r on r.tenant_id = t.tenant_id and r.term_id = t.id
    join sponsor_revision_decisions d on d.tenant_id = r.tenant_id and d.revision_id = r.id
    where t.tenant_id = ${f.a.tenant} and t.sponsor_id = ${f.a.sponsors}
    and t.term_start = ${END} and coalesce(t.terminated_effective_at, t.term_end) > t.term_start
    and d.decision = 'approved'`;
  return result.length > 0;
}

test('Predecessor termination commits before successor approval in the reverse serial order', async t => {
  await withFixture(t, async f => {
    const next = await successor(f);
    await race(
      f,
      'sponsors',
      async tx => {
        assert.equal(await hasSuccessor(tx, f), false);
        await update(tx, 'sponsor_terms', f.a.sponsor_terms, {
          terminated_effective_at: MID,
          terminated_by: f.a.staff,
          terminated_at: START,
        });
      },
      async tx => {
        const [before] =
          await tx`select terminated_effective_at from sponsor_terms where id = ${f.a.sponsor_terms}`;
        assert.equal(iso(before?.terminated_effective_at), MID);
        // decideRevision does not undo a committed predecessor termination.
        await approve(tx, f, next.revisionId);
      }
    );
    await restricted(f.admin, f.a, async tx => {
      const [term] =
        await tx`select terminated_effective_at from sponsor_terms where id = ${f.a.sponsor_terms}`;
      assert.equal(iso(term?.terminated_effective_at), MID);
      assert.equal(await hasSuccessor(tx, f), true);
    });
  });
});

for (const target of ['sponsors', 'sponsor_terms'] as const) {
  test(`Successor approval commits before termination; ${target} FOR UPDATE forces a fresh decision`, async t => {
    await withFixture(t, async f => {
      const next = await successor(f);
      await race(
        f,
        target,
        tx => approve(tx, f, next.revisionId),
        async tx => {
          assert.equal(
            await hasSuccessor(tx, f),
            true,
            'Termination must refuse the approved non-empty successor'
          );
        }
      );
      await restricted(f.admin, f.a, async tx => {
        const [term] =
          await tx`select terminated_effective_at from sponsor_terms where id = ${f.a.sponsor_terms}`;
        assert.equal(term?.terminated_effective_at, null);
        assert.equal(await hasSuccessor(tx, f), true);
      });
    });
  });

  test(`Empty successor termination commits before approval; ${target} lock preserves the empty interval`, async t => {
    await withFixture(t, async f => {
      const next = await successor(f);
      await race(
        f,
        target,
        tx =>
          update(tx, 'sponsor_terms', next.termId, {
            terminated_effective_at: END,
            terminated_by: f.a.staff,
            terminated_at: START,
          }),
        async tx => {
          const [term] =
            await tx`select terminated_effective_at from sponsor_terms where id = ${next.termId}`;
          assert.equal(iso(term?.terminated_effective_at), END);
          await approve(tx, f, next.revisionId);
          assert.equal(
            await hasSuccessor(tx, f),
            false,
            'An approved empty successor does not block predecessor termination'
          );
          await update(tx, 'sponsor_terms', f.a.sponsor_terms, {
            terminated_effective_at: MID,
            terminated_by: f.a.staff,
            terminated_at: START,
          });
        }
      );
      await restricted(f.admin, f.a, async tx => {
        const terms = await tx`select id, terminated_effective_at from sponsor_terms
          where sponsor_id = ${f.a.sponsors}`;
        assert.equal(
          iso(terms.find(term => term.id === next.termId)?.terminated_effective_at),
          END
        );
        assert.equal(
          iso(terms.find(term => term.id === f.a.sponsor_terms)?.terminated_effective_at),
          MID
        );
        const decisions =
          await tx`select decision from sponsor_revision_decisions where revision_id = ${next.revisionId}`;
        assert.deepEqual(
          decisions.map(d => d.decision),
          ['approved']
        );
      });
    });
  });
}
