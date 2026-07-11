import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceRuntime } from '../public/src/app/workspace-runtime.mjs';
import { makeStorage } from './state-fixtures.mjs';
import {
  installRuntimeGlobals,
  storedDraft,
  suggestionBundle,
} from './suggestion-state-fixtures.mjs';

const key = 'review-console:v1:draft:assign_a:reviewer_a:1';
const waitForSave = () => new Promise(resolve => setTimeout(resolve, 500));

function trackedStorage(seed) {
  const storage = makeStorage();
  if (seed) storage.setItem(key, JSON.stringify(seed));
  let writes = 0;
  const setItem = storage.setItem;
  storage.setItem = (name, value) => {
    writes += 1;
    setItem(name, value);
  };
  return { storage, writes: () => writes };
}

function start({ seed, getLocalDate }) {
  const tracked = trackedStorage(seed);
  installRuntimeGlobals(tracked.storage);
  const renders = [];
  const runtime = createWorkspaceRuntime({
    bundle: suggestionBundle(),
    initialItemId: 'item_a',
    getLocalDate,
    onRender: value => renders.push(value),
    onNavigate() {},
  });
  return { ...tracked, renders, runtime };
}

test('fresh workspace captures one date and persists one initialized draft', async () => {
  let dates = 0;
  const fixture = start({
    getLocalDate: () => (++dates, '2026-07-10'),
  });
  await waitForSave();
  const saved = JSON.parse(fixture.storage.getItem(key));
  assert.equal(dates, 1);
  assert.equal(fixture.writes(), 1);
  assert.equal(saved.suggestionVersion, 2);
  assert.equal(saved.itemDecisions.item_a.verifiedAt, '2026-07-10');
  assert.equal(saved.safeEvidenceConfirmed, false);
  fixture.runtime.dispose();
});

test('version-1 workspace restores blanks without date reads or rewrites', async () => {
  const seed = storedDraft();
  seed.itemDecisions.item_a.concreteAnswer = '';
  seed.itemDecisions.item_a.responses = { areas: [] };
  let dates = 0;
  const fixture = start({ seed, getLocalDate: () => (++dates, '2026-07-10') });
  await waitForSave();
  assert.equal(dates, 0);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.renders[0].state.decisions.item_a.concreteAnswer, '');
  assert.deepEqual(fixture.renders[0].state.decisions.item_a.responses.areas, []);
  fixture.runtime.dispose();
});

test('legacy workspace migrates absent fields with one date read and one save', async () => {
  const seed = storedDraft();
  delete seed.suggestionVersion;
  seed.itemDecisions.item_a.concreteAnswer = '';
  seed.itemDecisions.item_a.responses = { areas: [] };
  let dates = 0;
  const fixture = start({ seed, getLocalDate: () => (++dates, '2026-07-10') });
  await waitForSave();
  const saved = JSON.parse(fixture.storage.getItem(key));
  assert.equal(dates, 1);
  assert.equal(fixture.writes(), 1);
  assert.equal(saved.suggestionVersion, 2);
  assert.equal(saved.itemDecisions.item_a.concreteAnswer, '');
  assert.deepEqual(saved.itemDecisions.item_a.responses.areas, []);
  assert.equal(saved.itemDecisions.item_a.responses.reviewedAt, '2026-07-10');
  fixture.runtime.dispose();
});

test('unsupported suggestion version stays recoverable without initialization', async () => {
  const seed = storedDraft({ suggestionVersion: 2 });
  let dates = 0;
  const fixture = start({ seed, getLocalDate: () => (++dates, '2026-07-10') });
  await waitForSave();
  assert.equal(dates, 0);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.runtime.recovery.code, 'invalid_data');
  fixture.runtime.dispose();
});
