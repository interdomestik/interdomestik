import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceRuntime } from '../public/src/app/workspace-runtime.mjs';
import { installRuntimeGlobals, storedDraft, suggestionBundle } from './suggestion-state-fixtures.mjs';

const key = 'review-console:v2:draft:assign_a:reviewer_a:draft_account_a:1';
const cases = [
  ['unsupported suggestion version', JSON.stringify(storedDraft({ suggestionVersion: 2 })), 'invalid_data'],
  ['corrupt JSON', '{bad', 'invalid_data'],
  ['schema mismatch', JSON.stringify(storedDraft({ schemaVersion: 2 })), 'schema_mismatch'],
];

function trackedStorage(raw) {
  let gets = 0;
  let writes = 0;
  return {
    getItem(name) {
      gets += 1;
      return name === key ? raw : null;
    },
    setItem() {
      writes += 1;
    },
    removeItem() {},
    gets: () => gets,
    writes: () => writes,
    raw: () => raw,
  };
}

function start(raw) {
  const storage = trackedStorage(raw);
  installRuntimeGlobals(storage);
  const renders = [];
  const statuses = [];
  const callbacks = { conflicts: 0, validations: 0, navigations: 0 };
  const runtime = createWorkspaceRuntime({
    bundle: suggestionBundle(),
    initialItemId: 'item_b',
    getLocalDate: () => assert.fail('recovery must not initialize suggestions'),
    onRender: props => renders.push(props),
    onStatus: status => statuses.push(status),
    onConflict: () => callbacks.conflicts++,
    onValidate: () => callbacks.validations++,
    onNavigate: () => callbacks.navigations++,
  });
  return { storage, renders, statuses, callbacks, runtime };
}

test('recovery preserves classification during non-first initial route selection', () => {
  for (const [name, raw, code] of cases) {
    const fixture = start(raw);
    assert.equal(fixture.runtime.recovery.code, code, name);
    assert.equal(fixture.renders[0].recovery.code, code, name);
    assert.equal(fixture.storage.gets(), 1, name);
    assert.equal(fixture.storage.writes(), 0, name);
    assert.deepEqual(fixture.statuses, [], name);
    assert.equal(fixture.storage.raw(), raw, name);
    fixture.runtime.dispose();
  }
});

test('recovery validation performs no autosave or workflow callback', () => {
  for (const [name, raw, code] of cases) {
    const fixture = start(raw);
    fixture.renders[0].onValidate();
    assert.equal(fixture.renders.at(-1).recovery.code, code, name);
    assert.equal(fixture.storage.gets(), 1, name);
    assert.equal(fixture.storage.writes(), 0, name);
    assert.deepEqual(fixture.statuses, [], name);
    assert.deepEqual(fixture.callbacks, { conflicts: 0, validations: 0, navigations: 0 }, name);
    assert.equal(fixture.storage.raw(), raw, name);
    fixture.runtime.dispose();
  }
});

test('recovery item selection does not flush, navigate, or replace recovery', () => {
  for (const [name, raw, code] of cases) {
    const fixture = start(raw);
    fixture.renders[0].onSelectItem('item_a');
    assert.equal(fixture.renders.at(-1).recovery.code, code, name);
    assert.equal(fixture.storage.gets(), 1, name);
    assert.equal(fixture.storage.writes(), 0, name);
    assert.deepEqual(fixture.statuses, [], name);
    assert.deepEqual(fixture.callbacks, { conflicts: 0, validations: 0, navigations: 0 }, name);
    assert.equal(fixture.storage.raw(), raw, name);
    fixture.runtime.dispose();
  }
});
