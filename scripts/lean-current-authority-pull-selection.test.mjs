import assert from 'node:assert/strict';
import test from 'node:test';

import { selectFullProductPull } from './lean-current-authority.mjs';

test('downstream list summary is expanded to one full pull response', () => {
  assert.throws(() => selectFullProductPull(null, () => ({})), /inventory/);
  for (const full of [
    { number: 7, state: 'open', merged: false, changed_files: 2 },
    { number: 8, state: 'closed', merged: false, changed_files: 2 },
    { number: 9, state: 'closed', merged: true, changed_files: 2 },
  ]) {
    assert.deepEqual(
      selectFullProductPull([{ number: full.number }], number => ({ ...full, number })),
      full
    );
  }
  assert.equal(
    selectFullProductPull([], () => assert.fail('unexpected read')),
    null
  );
  assert.throws(
    () => selectFullProductPull([{ number: 1 }, { number: 2 }], () => ({})),
    /multiple/
  );
  const branch = 'codex/t117b-data-closeout',
    main = 'a'.repeat(40),
    head = 'b'.repeat(40);
  const closeout = (number, exact = false) => ({
    number,
    state: 'open',
    merged: false,
    base: { sha: exact ? main : 'c'.repeat(40) },
    head: { ref: branch, sha: exact ? head : 'd'.repeat(40) },
    changed_files: 2,
  });
  const list = [{ number: 1 }, { number: 2 }],
    read = number => closeout(number, number === 2);
  const identity = { branch, protectedMainSha: main, headShas: [head] };
  const select = (items = list, reader = read, exact = identity) =>
    selectFullProductPull(items, reader, exact);
  assert.equal(select().number, 2);
  assert.throws(() => select(list, read, { ...identity, headShas: [] }), /identity/);
  assert.throws(
    () => select([...list, { number: 3 }], number => closeout(number, true)),
    /identity/
  );
  assert.throws(() => select(Array(10).fill({ number: 1 }), read), /incomplete/);
  assert.throws(() => select(list, () => ({ number: 1 })), /malformed/);
});
