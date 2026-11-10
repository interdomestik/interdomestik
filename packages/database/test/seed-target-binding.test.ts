import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { assertSeedTargetAllowed, resetSeedTargetBindingForTests } from '../src/seed-target-guard';

const local = { DATABASE_URL: 'postgres://fixture@localhost/db' };
const binding = Symbol.for('interdomestik.seed-target-binding');
const clients = globalThis as typeof globalThis & {
  queryClientAdmin?: unknown;
  queryClientRls?: unknown;
};
const localOptions = { host: ['localhost'], port: [5432], user: 'fixture', database: 'db' };
beforeEach(resetSeedTargetBindingForTests);
afterEach(() => {
  delete clients.queryClientAdmin;
  delete clients.queryClientRls;
});

test('runner and seeder preflights share a permanent slot with a hashed fingerprint', () => {
  assert.equal(assertSeedTargetAllowed(local), 'local');
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, binding);
  assert.ok(descriptor);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, false);
  assert.equal(descriptor.writable, false);
  assert.equal(Reflect.deleteProperty(globalThis, binding), false);
  assert.match(descriptor.value.binding.fingerprint, /^[a-f\d]{64}$/);
  clients.queryClientAdmin = { options: localOptions };
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
      assert.equal(Object.getOwnPropertyDescriptor(globalThis, binding)?.value.binding, undefined);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
}

test('a rejected target does not bind the process', () => {
  assert.throws(() => assertSeedTargetAllowed({}), /refused: invalid$/);
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, binding)?.value.binding, undefined);
  assert.equal(assertSeedTargetAllowed(local), 'local');
});

test('the reset refuses outside the node test runner and preserves the binding', () => {
  assertSeedTargetAllowed(local);
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    assert.throws(resetSeedTargetBindingForTests, /refused: test-reset-only$/);
    assert.throws(() => assertSeedTargetAllowed({ ...local, PGPORT: '5433' }), /target-changed$/);
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previous;
  }
});

for (const key of ['queryClientAdmin', 'queryClientRls'] as const) {
  test(`${key} rejects a client created for B between preflights for A`, () => {
    const env = { ...local };
    assertSeedTargetAllowed(env);
    env.DATABASE_URL = 'postgres://fixture@remote.example.net/db';
    clients[key] = { options: { ...localOptions, host: [new URL(env.DATABASE_URL).hostname] } };
    env.DATABASE_URL = local.DATABASE_URL;
    assert.throws(() => assertSeedTargetAllowed(env), {
      message: 'Seed target refused: client-mismatch',
    });
  });

  test(`${key} rejects mismatched or unreadable connection options`, () => {
    assertSeedTargetAllowed(local);
    const mismatches = [
      { host: ['remote.example.net'] },
      { host: ['localhost', 'remote.example.net'] },
      { port: [5433] },
      { port: [5432, 5433] },
      { port: ['5432'] },
      { user: 'other' },
      { database: 'other' },
    ];
    const candidates = mismatches.map(options => ({ options: { ...localOptions, ...options } }));
    const unreadable = Object.defineProperty({}, 'options', {
      get() {
        throw new Error('private');
      },
    });
    for (const candidate of [...candidates, {}, unreadable]) {
      clients[key] = candidate;
      assert.throws(() => assertSeedTargetAllowed(local), {
        message: 'Seed target refused: client-mismatch',
      });
    }
  });
}

test('admin and RLS clients each match their own URL target', () => {
  const env = {
    DATABASE_URL: 'postgres://admin@localhost:5440/admin_db',
    DATABASE_URL_RLS: 'postgres://runtime@localhost:5441/runtime_db',
  };
  assertSeedTargetAllowed(env);
  clients.queryClientAdmin = {
    options: { ...localOptions, port: [5440], user: 'admin', database: 'admin_db' },
  };
  clients.queryClientRls = {
    options: { ...localOptions, port: [5441], user: 'runtime', database: 'runtime_db' },
  };
  assert.equal(assertSeedTargetAllowed(env), 'local');
  clients.queryClientAdmin = clients.queryClientRls;
  assert.throws(() => assertSeedTargetAllowed(env), /refused: client-mismatch$/);
});

const driverCases = [
  {
    env: {
      DATABASE_URL: 'postgres://%66ixture@LOCALHOST:5434/db%20name',
      PGPORT: '5438',
      PGDATABASE: 'ignored',
      PGUSER: 'fixture',
    },
    options: { ...localOptions, host: ['LOCALHOST'], port: [5434], database: 'db%20name' },
  },
  {
    env: {
      DATABASE_URL: 'postgres:///',
      PGHOST: 'localhost',
      PGPORT: '5439',
      PGUSERNAME: 'Fixture',
      PGUSER: 'fixture',
      PGDATABASE: 'fallback_db',
    },
    options: { ...localOptions, port: [5439], user: 'Fixture', database: 'fallback_db' },
  },
  {
    env: { DATABASE_URL: 'postgres:///', PGUSERNAME: 'Fixture', PGUSER: 'fixture' },
    options: { ...localOptions, user: 'Fixture', database: 'Fixture' },
  },
];
for (const [index, { env, options }] of driverCases.entries()) {
  test(`driver precedence and raw database path match case ${index + 1}`, () => {
    assertSeedTargetAllowed(env);
    clients.queryClientAdmin = { options };
    clients.queryClientRls = clients.queryClientAdmin;
    assert.equal(assertSeedTargetAllowed(env), 'local');
  });
}
