import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputShape, sameOutputShape, freezeOutput } from './db-access-output-binding.mjs';

test('equal bytes in foreign nested objects cannot retain an actual output binding', () => {
  const value = { failures: [{ identity: 'i', occurrences: 2 }], contexts: [] };
  const before = outputShape(value);
  assert(sameOutputShape(before, value));
  assert(!sameOutputShape(before, structuredClone(value)));
  const rows = value.failures;
  value.failures = [...rows];
  assert(!sameOutputShape(before, value));
  value.failures = rows;
  assert(sameOutputShape(before, value));
});

test('counts, alias topology, undefined keys and negative zero remain distinct', () => {
  const shared = { count: 1 };
  const value = { first: shared, second: shared };
  assert.notEqual(
    outputShape(value).digest,
    outputShape({ first: { count: 1 }, second: { count: 1 } }).digest
  );
  const before = outputShape(value);
  shared.count = 2;
  assert(!sameOutputShape(before, value));
  assert.notEqual(outputShape({}).digest, outputShape({ added: undefined }).digest);
  assert.notEqual(outputShape(-0).digest, outputShape(0).digest);
});

test('sets preserve membership and object identity', () => {
  const row = { identity: 'i' },
    value = new Set([row]),
    before = outputShape(value);
  assert(sameOutputShape(before, value));
  value.add('foreign');
  assert(!sameOutputShape(before, value));
  value.delete('foreign');
  value.delete(row);
  value.add({ identity: 'i' });
  assert(!sameOutputShape(before, value));
});

test('getters, symbols, functions, cyclic and non-plain data fail closed', () => {
  const getter = Object.defineProperty({}, 'x', {
    get() {
      throw Error('must not execute');
    },
  });
  assert.throws(() => outputShape(getter), /accessor/);
  assert.throws(() => outputShape({ [Symbol('x')]: 1 }), /symbol/);
  assert.throws(() => outputShape({ x() {} }), /non-data/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => outputShape(cyclic), /cyclic/);
  assert.throws(() => outputShape(new Date()), /non-plain/);
});

test('frozen projection retains the same arrays and rows without full-output cloning', () => {
  const row = { occurrences: 3 },
    rows = [row],
    value = { rows };
  assert.equal(freezeOutput(value), value);
  assert.equal(value.rows, rows);
  assert.equal(value.rows[0], row);
  assert.throws(() => {
    row.occurrences++;
  }, TypeError);
  assert.throws(() => {
    rows.push({});
  }, TypeError);
});

test('same-content Set with an own has function loses its original binding', () => {
  const value = new Set(['source.ts']),
    before = outputShape(value);
  value.has = () => false;
  assert.throws(() => sameOutputShape(before, value), /decorated Set/);
  delete value.has;
  assert(sameOutputShape(before, value));
});

test('Set own keys reject before reading functions, getters or symbol iterators', () => {
  for (const key of ['has', 'size', 'values', 'hidden', Symbol.iterator, Symbol('extra')]) {
    let executed = 0;
    const value = new Set(['source.ts']),
      before = outputShape(value);
    Object.defineProperty(value, key, {
      configurable: true,
      get() {
        executed++;
        return () => [];
      },
    });
    assert.throws(() => sameOutputShape(before, value), /decorated Set/);
    assert.equal(executed, 0);
  }
  const value = new Set(['source.ts']);
  Object.defineProperty(value, 'hidden', { value: undefined, enumerable: false });
  assert.throws(() => outputShape(value), /decorated Set/);
});

test('Set subclasses and altered prototypes reject without invoking inherited iterators', () => {
  let executed = 0;
  class DerivedSet extends Set {
    get [Symbol.iterator]() {
      executed++;
      return () => [];
    }
  }
  const derived = new DerivedSet();
  Set.prototype.add.call(derived, 'source.ts');
  assert.throws(() => outputShape(derived), /non-intrinsic/);
  const value = new Set(['source.ts']);
  Object.setPrototypeOf(
    value,
    Object.defineProperty({}, Symbol.iterator, {
      get() {
        executed++;
        return () => [];
      },
    })
  );
  assert.throws(() => outputShape(value), /non-intrinsic/);
  assert.equal(executed, 0);
  Object.setPrototypeOf(value, Object.prototype);
  assert.throws(() => outputShape(value), /non-intrinsic/);
  assert.throws(() => outputShape(Object.create(Set.prototype)), /non-plain/);
});

test('captured Set size, values and iterator-next intrinsics bypass later getter overrides', () => {
  const value = new Set(['source.ts', { count: 2 }]),
    before = outputShape(value);
  const iteratorPrototype = Object.getPrototypeOf(Set.prototype.values.call(new Set()));
  const targets = [
    [Set.prototype, Symbol.iterator],
    [Set.prototype, 'size'],
    [Set.prototype, 'values'],
    [iteratorPrototype, 'next'],
  ];
  const original = targets.map(([target, key]) => Object.getOwnPropertyDescriptor(target, key));
  let executed = 0,
    after;
  try {
    targets.forEach(([target, key]) =>
      Object.defineProperty(target, key, {
        configurable: true,
        get() {
          executed++;
          throw Error('must not execute overridden intrinsic');
        },
      })
    );
    after = outputShape(value);
  } finally {
    targets.forEach(([target, key], index) => Object.defineProperty(target, key, original[index]));
  }
  assert.equal(executed, 0);
  assert.equal(after.digest, before.digest);
  assert.deepEqual(after.references, before.references);
});
