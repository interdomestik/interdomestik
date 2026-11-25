import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { withDisposableCleanup } from '../src/disposable-client';
import { type ScratchClient, withCreatedScratchDatabase } from './pg16/scratch-database';

const SUFFIX = '_0123456789ab';
const NAME = `${'a'.repeat(50)}${SUFFIX}`;
const CREATED = { oid: '4711', name: NAME, owner: '10' };

function maintenanceClient(t: TestContext, rows: readonly unknown[][], dropFailure?: Error) {
  const responses = [...rows];
  const unsafe = t.mock.fn(async (statement: string, _parameters?: string[]) => {
    if (dropFailure && statement.startsWith('drop database ')) throw dropFailure;
    return responses.shift();
  });
  return { admin: { unsafe } as unknown as Pick<ScratchClient, 'unsafe'>, unsafe };
}

test('refuses invalid or oversized generated identifiers before issuing any SQL', async t => {
  const { admin, unsafe } = maintenanceClient(t, []);
  const work = t.mock.fn(async () => {});
  for (const name of [
    SUFFIX,
    `1test${SUFFIX}`,
    `Test${SUFFIX}`,
    `bad-name${SUFFIX}`,
    `bad"name${SUFFIX}`,
    `té st${SUFFIX}`,
    `test${SUFFIX}\n`,
    'test_not_generated',
    `a${NAME}`,
  ]) {
    await assert.rejects(
      withCreatedScratchDatabase(admin, name, work),
      /Invalid scratch database identifier/u
    );
  }
  assert.equal(unsafe.mock.callCount(), 0);
  assert.equal(work.mock.callCount(), 0);
});

test('accepts a 63-byte generated identifier and force-drops it after verifying the OID', async t => {
  const { admin, unsafe } = maintenanceClient(t, [[], [CREATED], [CREATED], []]);
  const result = await withCreatedScratchDatabase(admin, NAME, async () => {
    assert.equal(unsafe.mock.callCount(), 2);
    return 'result';
  });
  assert.equal(result, 'result');

  const [create, capture, verify, drop] = unsafe.mock.calls.map(call => call.arguments);
  assert.equal(unsafe.mock.callCount(), 4);
  assert.deepEqual(create, [`create database "${NAME}"`]);
  assert.match(capture[0], /from pg_catalog\.pg_database where datname = \$1/u);
  assert.deepEqual(capture[1], [NAME]);
  assert.match(verify[0], /from pg_catalog\.pg_database where oid = \$1::oid/u);
  assert.deepEqual(verify[1], [CREATED.oid]);
  assert.deepEqual(drop, [`drop database "${NAME}" with (force)`]);
});

test('refuses cleanup when the identity could not be recorded at creation', async t => {
  const { admin, unsafe } = maintenanceClient(t, [[], []]);
  const work = t.mock.fn(async () => {});

  await assert.rejects(withCreatedScratchDatabase(admin, NAME, work), /Cannot record identity/u);
  assert.equal(unsafe.mock.callCount(), 2);
  assert.equal(work.mock.callCount(), 0);
});

for (const { description, current, message } of [
  { description: 'OID is missing', current: [], message: /OID 4711 is missing/u },
  {
    description: 'name changed',
    current: [{ ...CREATED, name: 'renamed' }],
    message: /name or owner changed for OID 4711/u,
  },
  {
    description: 'owner changed',
    current: [{ ...CREATED, owner: '11' }],
    message: /name or owner changed for OID 4711/u,
  },
]) {
  test(`refuses to drop any database when the recorded ${description}`, async t => {
    const { admin, unsafe } = maintenanceClient(t, [[], [CREATED], current]);

    await assert.rejects(
      withCreatedScratchDatabase(admin, NAME, async () => {}),
      message
    );
    assert.equal(unsafe.mock.callCount(), 3);
    assert.deepEqual(unsafe.mock.calls[2].arguments[1], [CREATED.oid]);
    assert.ok(unsafe.mock.calls.every(call => !call.arguments[0].startsWith('drop database ')));
  });
}

test('retains assertion, scratch close, drop, and maintenance close failures', async t => {
  const assertionFailure = new assert.AssertionError({ message: 'assertion failed' });
  const scratchCloseFailure = new Error('scratch close failed');
  const dropFailure = new Error('drop failed');
  const maintenanceCloseFailure = new Error('maintenance close failed');
  const { admin, unsafe } = maintenanceClient(t, [[], [CREATED], [CREATED]], dropFailure);

  await assert.rejects(
    withDisposableCleanup(
      () =>
        withCreatedScratchDatabase(admin, NAME, () =>
          withDisposableCleanup(
            () => Promise.reject(assertionFailure),
            () => Promise.reject(scratchCloseFailure),
            'Scratch client work and close both failed'
          )
        ),
      () => Promise.reject(maintenanceCloseFailure),
      'Maintenance client work and close both failed'
    ),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      const [scratch, close] = error.errors;
      assert.equal(close, maintenanceCloseFailure);
      assert.ok(scratch instanceof AggregateError);
      const [work, drop] = scratch.errors;
      assert.equal(drop, dropFailure);
      assert.ok(work instanceof AggregateError);
      assert.deepEqual(work.errors, [assertionFailure, scratchCloseFailure]);
      return true;
    }
  );
  assert.equal(unsafe.mock.callCount(), 4);
});
