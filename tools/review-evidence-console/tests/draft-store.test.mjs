import assert from 'node:assert/strict';
import test from 'node:test';
import { composeDraftKey, createDraftStore } from '../public/src/state/draft-store.mjs';
import { makeStorage } from './state-fixtures.mjs';

const keyParts = {
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  packetVersion: '2',
};
const key = 'review-console:v1:draft:assign_a:reviewer_a:2';
const draft = {
  schemaVersion: 1,
  assignmentId: 'assign_a',
  packetId: 'mob-03a-part-a',
  reviewerFixtureId: 'reviewer_a',
  packetVersion: '2',
  itemDecisions: { item_a: { decision: 'approve' } },
  activeItem: 'item_a',
  updatedAt: '2026-07-09T12:00:00.000Z',
  editorId: 'tab_a',
};

test('composes isolated draft keys from safe segments', () => {
  assert.equal(composeDraftKey(keyParts), key);
  for (const value of ['../bad', 'bad/value', '', 'bad value']) {
    assert.throws(() => composeDraftKey({ ...keyParts, assignmentId: value }));
  }
});

test('saves and loads a structurally valid compatible draft', () => {
  const store = createDraftStore({ storage: makeStorage(), schemaVersion: 1 });
  assert.deepEqual(store.save(key, draft, null), { ok: true, value: draft });
  assert.deepEqual(store.load(key), { ok: true, value: draft });
});

test('rejects incomplete, mismatched, or malformed draft state', () => {
  const store = createDraftStore({ storage: makeStorage(), schemaVersion: 1 });
  for (const candidate of [
    { ...draft, packetId: undefined },
    { ...draft, assignmentId: 'other' },
    { ...draft, updatedAt: 'yesterday' },
    { ...draft, itemDecisions: [] },
  ]) {
    assert.equal(store.save(key, candidate, null).code, 'invalid_data');
  }
});

test('stops on an optimistic multi-tab conflict', () => {
  const storage = makeStorage();
  const store = createDraftStore({ storage, schemaVersion: 1 });
  storage.setItem(key, JSON.stringify({ ...draft, updatedAt: '2026-07-09T12:01:00.000Z' }));
  assert.equal(store.save(key, draft, draft.updatedAt).code, 'conflict');
  assert.match(storage.getItem(key), /12:01:00/);
});

test('allows replacing the exact expected revision', () => {
  const storage = makeStorage();
  const store = createDraftStore({ storage, schemaVersion: 1 });
  storage.setItem(key, JSON.stringify(draft));
  const newer = { ...draft, updatedAt: '2026-07-09T12:02:00.000Z' };
  assert.equal(store.save(key, newer, draft.updatedAt).ok, true);
});

test('preserves incompatible and corrupt data for untouched recovery', () => {
  const storage = makeStorage();
  const store = createDraftStore({ storage, schemaVersion: 1 });
  const incompatible = JSON.stringify({ ...draft, schemaVersion: 2 });
  storage.setItem(key, incompatible);
  assert.equal(store.load(key).code, 'schema_mismatch');
  assert.deepEqual(store.exportRecovery(key), { ok: true, value: incompatible });
  storage.setItem(key, '{bad');
  assert.equal(store.load(key).code, 'invalid_data');
  assert.deepEqual(store.exportRecovery(key), { ok: true, value: '{bad' });
  assert.equal(storage.getItem(key), '{bad');
});

test('accepts legacy and version-1 suggestions but rejects owned unsupported versions', () => {
  const storage = makeStorage();
  const store = createDraftStore({ storage, schemaVersion: 1 });
  for (const suggestionVersion of [undefined, 1]) {
    const candidate = { ...draft, suggestionVersion };
    if (suggestionVersion === undefined) delete candidate.suggestionVersion;
    storage.setItem(key, JSON.stringify(candidate));
    assert.equal(store.load(key).ok, true);
  }
  storage.setItem(key, JSON.stringify({ ...draft, suggestionVersion: 2 }));
  assert.equal(store.load(key).code, 'invalid_data');
});

test('removes only the requested draft', () => {
  const storage = makeStorage();
  storage.setItem(key, JSON.stringify(draft));
  storage.setItem('other', '{}');
  assert.equal(createDraftStore({ storage, schemaVersion: 1 }).remove(key).ok, true);
  assert.equal(storage.getItem('other'), '{}');
});

test('maps quota and browser storage exceptions to stable errors', () => {
  const quota = makeStorage();
  quota.setItem = () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  assert.equal(
    createDraftStore({ storage: quota, schemaVersion: 1 }).save(key, draft, null).code,
    'quota'
  );
  const unavailable = makeStorage();
  unavailable.getItem = () => {
    throw new Error('disabled');
  };
  assert.equal(
    createDraftStore({ storage: unavailable, schemaVersion: 1 }).load(key).code,
    'unavailable'
  );
});

test('rejects non-owned keys before any storage access or mutation', () => {
  let accesses = 0;
  const storage = {
    getItem: () => {
      accesses += 1;
      return '{}';
    },
    setItem: () => {
      accesses += 1;
    },
    removeItem: () => {
      accesses += 1;
    },
  };
  const store = createDraftStore({ storage, schemaVersion: 1 });
  for (const invalidKey of ['other', 'review-console:v1:draft:../bad:r:1', `${key}:extra`]) {
    assert.equal(store.load(invalidKey).code, 'invalid_data');
    assert.equal(store.save(invalidKey, draft, null).code, 'invalid_data');
    assert.equal(store.remove(invalidKey).code, 'invalid_data');
    assert.equal(store.exportRecovery(invalidKey).code, 'invalid_data');
  }
  assert.equal(accesses, 0);
});
