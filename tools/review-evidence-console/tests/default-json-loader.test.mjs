import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('browser fixture repository has no server fixture import boundary', async () => {
  const source = await readFile(
    new URL('../public/src/data/fixture-repository.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /server\//u);
});

test('loads every bundled fixture without invoking fetch or XMLHttpRequest', async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  let fetchCalls = 0;
  let xhrCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    assert.fail('fetch must not be called');
  };
  globalThis.XMLHttpRequest = class {
    constructor() {
      xhrCalls += 1;
      assert.fail('XMLHttpRequest must not be constructed');
    }
  };
  try {
    const { defaultJsonLoader } = await import(
      `./static-fixture-repository.mjs?static-loader-test=${Date.now()}`
    );
    const reviewers = await defaultJsonLoader('/data/reviewers.json');
    const assignments = await defaultJsonLoader('/data/assignments.json');
    const packet = await defaultJsonLoader('/data/packets/mob-03a-part-a.json');
    const secondPacket = await defaultJsonLoader('/data/packets/mob-03a-part-b.json');
    assert.equal(reviewers[0].id, 'reviewer_governance_mk');
    assert.equal(assignments.length, 2);
    assert.equal(packet.id, 'mob-03a-part-a');
    assert.equal(secondPacket.id, 'mob-03a-part-b');
    assert.equal(fetchCalls, 0);
    assert.equal(xhrCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXhr;
  }
});
