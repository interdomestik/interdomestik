import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const composeUrl = new URL('../../ops/forgejo-runner/compose.yaml', import.meta.url);
const compose = await readFile(composeUrl, 'utf8');

test('runner uses pinned images and a private Docker daemon', () => {
  const pinnedImages = compose.match(/^\s{4}image: .+@sha256:[0-9a-f]{64}$/gmu) ?? [];
  assert.equal(pinnedImages.length, 2);
  assert.match(compose, /^\s{4}privileged: true$/mu);
  assert.match(compose, /^\s{6}- runner-private$/mu);
  assert.match(compose, /^\s{4}internal: true$/mu);
  assert.doesNotMatch(compose, /^\s{4}ports:/mu);
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/u);
});

test('ordinary jobs are bounded and the runner is hardened', () => {
  assert.match(compose, /^\s{4}cpuset: '0-5,12-17'$/mu);
  assert.match(compose, /^\s{4}mem_limit: 10g$/mu);
  assert.match(compose, /^\s{4}read_only: true$/mu);
  assert.match(compose, /^\s{6}- ALL$/mu);
  assert.match(compose, /^\s{6}- no-new-privileges:true$/mu);
  assert.match(compose, /forgejo-runner daemon --config \/data\/runner-config\.yml/u);
});
