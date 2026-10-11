import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCodeUnits } from './db-access-order.mjs';

// Every expected order is written out explicitly and also checked against the engine default sort.
const both = values => [[...values].sort(), [...values].sort(compareCodeUnits)];

test('comparator returns the default three-way code-unit relation', () => {
  assert.equal(compareCodeUnits('a', 'a'), 0);
  assert.equal(compareCodeUnits('a', 'b'), -1);
  assert.equal(compareCodeUnits('b', 'a'), 1);
  assert.equal(compareCodeUnits(['a', 'b'], 'a,b'), 0);
  assert.equal(compareCodeUnits('10', '9'), -1);
});

test('strings sort by UTF-16 code units, not locale, case folding or numeric value', () => {
  const corpus = ['b', 'B', 'a', '10', '9', '1,2', '1:2', '\uFF5E', '\u{1F600}', 'A'];
  // The surrogate pair of U+1F600 starts with 0xD83D, below the BMP code unit 0xFF5E.
  const expected = ['1,2', '10', '1:2', '9', 'A', 'B', 'a', 'b', '\u{1F600}', '\uFF5E'];
  const [reference, candidate] = both(corpus);
  assert.deepEqual(reference, expected);
  assert.deepEqual(candidate, expected);
});

test('nested tuples compare by their whole comma-joined string with stable ties', () => {
  const third = ['x', ['b', 'a']];
  const second = ['x,a'];
  const fourth = ['x,a', []];
  const first = ['x', ['a']];
  const input = [third, second, fourth, first];
  const order = sorted => sorted.map(item => input.indexOf(item));
  for (const sorted of both(input)) assert.deepEqual(order(sorted), [1, 3, 2, 0]);
  const firstElementOnly = [...input].sort((a, b) => compareCodeUnits(a[0], b[0]));
  assert.notDeepEqual(order(firstElementOnly), [1, 3, 2, 0]);
  const shared = [
    ['f:1:2', ['b']],
    ['f:1:2', ['a', 'c']],
    ['e:9:9', []],
  ];
  for (const sorted of both(shared))
    assert.deepEqual(sorted, [
      ['e:9:9', []],
      ['f:1:2', ['a', 'c']],
      ['f:1:2', ['b']],
    ]);
});

test('actual undefined elements and holes stay last without reaching the comparator', () => {
  const input = ['b', undefined, 'a', ['c'], undefined, 'undefined'];
  const compared = [];
  const observed = [...input].sort((left, right) => {
    compared.push(left, right);
    return compareCodeUnits(left, right);
  });
  const expected = ['a', 'b', ['c'], 'undefined', undefined, undefined];
  assert.deepEqual(observed, expected);
  assert.deepEqual([...input].sort(), expected);
  assert.equal(compared.includes(undefined), false);
  const locations = [['f:1:2', 'f:3:4'], undefined, ['f:1:2'], ['e:9:9']];
  const expectedLocations = [['e:9:9'], ['f:1:2'], ['f:1:2', 'f:3:4'], undefined];
  for (const sorted of both(locations)) assert.deepEqual(sorted, expectedLocations);
  const sparse = new Array(3);
  sparse[0] = 'b';
  sparse[2] = 'a';
  const holes = sparse.sort(compareCodeUnits);
  assert.equal(holes.length, 3);
  assert.deepEqual([holes[0], holes[1]], ['a', 'b']);
  assert.equal(2 in holes, false);
});

test('equal strings keep their input order', () => {
  const one = ['k'];
  const two = ['k'];
  const three = 'k';
  const other = 'j';
  const input = [one, other, two, three];
  for (const sorted of both(input)) {
    assert.equal(sorted[0], other);
    assert.deepEqual(
      sorted.slice(1).map(item => input.indexOf(item)),
      [0, 2, 3]
    );
  }
});
