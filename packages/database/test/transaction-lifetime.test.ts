import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ClosedTransactionError,
  withTransactionLifetime,
  type PendingQuery,
  type PoolSql,
  type TransactionSql,
} from '../src/transaction-lifetime';

// A driver double with postgres.js's deferral: a query is created by `unsafe` but reaches the
// server only when its handler runs, one tick after the first `then`. `sent` records what the
// fake server actually received, so a revoked query is one that never reached it. Like the real
// driver, each scope sends its own control statement into `control` once its callback settles.
type Driver = { sent: string[]; created: string[]; control: string[]; pool: PoolSql };

function fakeQuery(text: string, sent: string[]): PendingQuery {
  let settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void };
  const result = new Promise<unknown>((resolve, reject) => {
    settle = { resolve, reject };
  });
  let executed = false;
  const query: PendingQuery = {
    handler: () => {
      sent.push(text);
      settle.resolve(text);
    },
    reject: error => settle.reject(error),
    then(onFulfilled, onRejected) {
      if (!executed) {
        executed = true;
        void Promise.resolve().then(() => query.handler(query));
      }
      return result.then(onFulfilled, onRejected);
    },
  };
  return query;
}

function fakeDriver(options: { failBegin?: Promise<never> } = {}): Driver {
  const sent: string[] = [];
  const created: string[] = [];
  const control: string[] = [];
  const finish = async <T>(work: () => Promise<T>, done: string, undo: string): Promise<T> => {
    try {
      const result = await work();
      if (done) control.push(done);
      return result;
    } catch (error) {
      control.push(undo);
      throw error;
    }
  };
  const unsafe = (text: string): PendingQuery => {
    created.push(text);
    return fakeQuery(text, sent);
  };
  const transactionSql = (): TransactionSql => ({
    options: { fake: true },
    unsafe,
    savepoint: callback => finish(() => callback(transactionSql()), '', 'rollback to'),
  });
  const pool: PoolSql = {
    options: { fake: true },
    unsafe,
    begin: callback => {
      const run = finish(() => callback(transactionSql()), 'commit', 'rollback');
      return options.failBegin ? Promise.race([run, options.failBegin]) : run;
    },
    end: async () => undefined,
  };
  return { sent, created, control, pool };
}

const isClosed = (error: unknown): boolean => error instanceof ClosedTransactionError;

test('a transaction hands out a working client and returns the callback result', async () => {
  const driver = fakeDriver();
  const pool = withTransactionLifetime(driver.pool);
  const result = await pool.begin(async sql => {
    assert.deepEqual(sql.options, { fake: true });
    return [
      await sql.unsafe('select 1'),
      await sql.savepoint(async inner => inner.unsafe('select 2')),
    ];
  });
  assert.deepEqual(result, ['select 1', 'select 2']);
  assert.deepEqual(driver.sent, ['select 1', 'select 2']);
  assert.deepEqual(driver.control, ['commit']);
  assert.equal(await pool.unsafe('select 3'), 'select 3', 'pool queries pass through');
});

test('a query built while open but dispatched after the end never reaches the server', async () => {
  const driver = fakeDriver();
  const pool = withTransactionLifetime(driver.pool);
  let pending: PendingQuery | undefined;
  await pool.begin(async sql => {
    pending = sql.unsafe('update escaped');
  });
  assert.ok(pending);
  await assert.rejects(async () => pending, isClosed);
  assert.deepEqual(driver.created, ['update escaped']);
  assert.deepEqual(driver.sent, [], 'the dispatch guard rejected it before sending');
});

test('a captured client refuses new queries synchronously after the end', async () => {
  const driver = fakeDriver();
  const pool = withTransactionLifetime(driver.pool);
  let kept: TransactionSql | undefined;
  await pool.begin(async sql => {
    kept = sql;
  });
  assert.ok(kept);
  const escaped = kept;
  assert.throws(() => escaped.unsafe('insert escaped'), isClosed);
  await assert.rejects(
    escaped.savepoint(async () => undefined),
    isClosed
  );
  assert.deepEqual(driver.created, [], 'the driver was never asked to build the query');
});

test('the end of a failed transaction revokes its client too', async () => {
  const driver = fakeDriver();
  const pool = withTransactionLifetime(driver.pool);
  let kept: TransactionSql | undefined;
  await assert.rejects(
    pool.begin(async sql => {
      kept = sql;
      throw new Error('rollback');
    }),
    /rollback/u
  );
  assert.throws(() => kept?.unsafe('select after rollback'), isClosed);
  assert.deepEqual(driver.sent, []);
});

test('a savepoint client expires with its own callback while the parent stays open', async () => {
  const driver = fakeDriver();
  const pool = withTransactionLifetime(driver.pool);
  await pool.begin(async sql => {
    let child: TransactionSql | undefined;
    await sql.savepoint(async inner => {
      child = inner;
    });
    assert.throws(() => child?.unsafe('child after its end'), isClosed);
    assert.equal(await sql.unsafe('parent still open'), 'parent still open');
  });
  assert.deepEqual(driver.sent, ['parent still open']);
});

test('a detached savepoint is revoked by its ancestor and drained before the end', async () => {
  const driver = fakeDriver();
  const pool = withTransactionLifetime(driver.pool);
  let release = () => undefined as void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let detached: Promise<unknown> | undefined;
  let childSettled = false;
  let ended = false;
  const run = pool.begin(async sql => {
    detached = sql.savepoint(async inner => {
      await gate;
      return inner.unsafe('detached write');
    });
    void detached.then(
      () => undefined,
      () => {
        childSettled = true;
      }
    );
  });
  void run.then(() => {
    ended = true;
  });
  await new Promise(setImmediate);
  assert.equal(ended, false, 'the transaction waits for its detached child');
  release();
  await run;
  assert.equal(childSettled, true, 'the transaction ended only after the detached child failed');
  assert.deepEqual(driver.control, ['rollback to', 'commit'], 'the child finished first');
  await assert.rejects(async () => detached, isClosed);
  assert.deepEqual(driver.sent, []);
});

// After a lost connection the driver may hand the same connection object to the next transaction.
// The abandoned callback may resume later, but its scope must never send COMMIT, ROLLBACK or
// ROLLBACK TO there, whether it then succeeds, throws, or was inside a savepoint.
for (const outcome of ['returns', 'throws', 'throws in a savepoint'] as const) {
  test(`a lost connection fences the callback that resumes and ${outcome}`, async () => {
    let fail = (_error: Error) => undefined as void;
    const failBegin = new Promise<never>((_, reject) => {
      fail = reject;
    });
    const driver = fakeDriver({ failBegin });
    const pool = withTransactionLifetime(driver.pool);
    let resume = () => undefined as void;
    const suspended = new Promise<void>(resolve => {
      resume = resolve;
    });
    let kept: TransactionSql | undefined;
    let resumed = false;
    const body = async (sql: TransactionSql) => {
      kept = sql;
      await suspended;
      resumed = true;
      if (outcome !== 'returns') throw new Error('late failure');
      return 'late result';
    };
    const run = pool.begin(sql =>
      outcome === 'throws in a savepoint' ? sql.savepoint(body) : body(sql)
    );
    await new Promise(setImmediate);
    fail(new Error('connection lost'));
    await assert.rejects(run, /connection lost/u);
    assert.throws(() => kept?.unsafe('select after loss'), isClosed);

    resume();
    await new Promise(setImmediate);
    assert.equal(resumed, true, 'the abandoned callback did resume');
    assert.deepEqual(driver.control, [], 'no control statement reached the reused connection');
    assert.deepEqual(driver.sent, []);
  });
}

test('only callback call forms are accepted', async () => {
  const pool = withTransactionLifetime(fakeDriver().pool);
  const begin = pool.begin as unknown as (...args: unknown[]) => Promise<unknown>;
  assert.throws(() => begin('read write', async () => undefined), TypeError);
  await pool.begin(async sql => {
    const savepoint = sql.savepoint as unknown as (...args: unknown[]) => Promise<unknown>;
    assert.throws(() => savepoint('name', async () => undefined), TypeError);
  });
  assert.ok(Object.isFrozen(pool), 'the wrapped pool cannot be patched');
});
