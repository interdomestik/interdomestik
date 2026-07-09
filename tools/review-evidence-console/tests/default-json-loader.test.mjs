import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultJsonLoader } from '../public/src/data/fixture-repository.mjs';

test('loads bundled fixture JSON without invoking fetch or XMLHttpRequest', async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  globalThis.fetch = () => assert.fail('fetch must not be called');
  globalThis.XMLHttpRequest = class {
    constructor() {
      assert.fail('XMLHttpRequest must not be constructed');
    }
  };
  try {
    const reviewers = await defaultJsonLoader('/data/reviewers.json');
    const packet = await defaultJsonLoader('/data/packets/mob-03a-part-a.json');
    assert.equal(reviewers[0].id, 'reviewer_privacy_mk');
    assert.equal(packet.id, 'mob-03a-part-a');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXhr;
  }
});
