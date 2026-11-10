import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { assertSeedTargetAllowed, resetSeedTargetBindingForTests } from '../src/seed-target-guard';

const local = { DATABASE_URL: 'postgres://fixture@localhost/db' };
const binding = Symbol.for('interdomestik.seed-target-binding');
beforeEach(resetSeedTargetBindingForTests);

test('runner preflight and repeated seeder preflights share a hash-only binding', () => {
  assert.equal(assertSeedTargetAllowed(local), 'local');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, binding);
  assert.ok(descriptor);
  assert.equal(descriptor.enumerable, false);
  assert.match(descriptor.value, /^[a-f0-9]{64}$/);
  const clients = globalThis as typeof globalThis & { queryClientAdmin?: unknown };
  clients.queryClientAdmin = {};
  try {
    assert.equal(assertSeedTargetAllowed({ ...local }), 'local');
    assert.equal(Object.getOwnPropertyDescriptor(globalThis, binding)?.value, descriptor.value);
  } finally {
    delete clients.queryClientAdmin;
  }
});

const changedInputs = {
  DATABASE_URL: 'postgres://fixture@localhost:5433/db',
  DATABASE_URL_RLS: local.DATABASE_URL,
  PGHOST: 'localhost',
  PGHOSTADDR: 'localhost',
  PGPORT: '5433',
  PGUSER: 'fixture',
  PGUSERNAME: 'fixture',
  PGDATABASE: 'other_db',
  SEED_TARGET_CONFIRM: 'plan070:localhost',
};

for (const [key, value] of Object.entries(changedInputs)) {
  test(`a later preflight refuses changed raw ${key}`, () => {
    assertSeedTargetAllowed(local);
    assert.throws(() => assertSeedTargetAllowed({ ...local, [key]: value }), {
      message: 'Seed target refused: target-changed',
    });
    assert.equal(assertSeedTargetAllowed(local), 'local');
  });
}

test('fingerprints distinguish undefined, empty and differently encoded raw inputs', () => {
  assertSeedTargetAllowed(local);
  for (const env of [
    { ...local, PGPORT: '' },
    { DATABASE_URL: 'postgres://%66ixture@localhost/db' },
    { DATABASE_URL: 'postgres://fixture@LOCALHOST/db' },
  ]) {
    assert.throws(() => assertSeedTargetAllowed(env), /refused: target-changed$/);
  }
});

for (const key of ['queryClientAdmin', 'queryClientRls'] as const) {
  test(`a cached ${key} cannot acquire a first preflight binding`, () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value: {}, configurable: true });
    try {
      assert.throws(() => assertSeedTargetAllowed(local), /refused: unbound-client$/);
      assert.equal(Object.getOwnPropertyDescriptor(globalThis, binding), undefined);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
}

test('a rejected target does not bind the process', () => {
  assert.throws(() => assertSeedTargetAllowed({}), /refused: invalid$/);
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, binding), undefined);
  assert.equal(assertSeedTargetAllowed(local), 'local');
});
