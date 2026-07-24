import assert from 'node:assert/strict';
import test from 'node:test';

import { issuePermit, permitProblems, verifyPermit } from './z620-push-permit-lib.mjs';

const sha = 'e12ea1ae2207468cc839d8ceb0280eeea0524fe8';
const input = {
  sha,
  branch: 'codex/z620-pre-push-ci',
  executor: 'z620-linux-amd64',
  clean: true,
  parityStatus: 'pass',
  checksumsValid: true,
  health: { postgres: true, supabase: true },
  providers: { sonar: 'pass', sentry: 'pass' },
  requiredResults: [
    { id: 'static', status: 'pass' },
    { id: 'e2e', status: 'pass' },
  ],
};

test('clean green candidate receives an expiring manual-only permit', () => {
  const permit = issuePermit(input, { key: 'test-key', now: 1_000, ttlMs: 5_000 });
  assert.equal(permit.version, 2);
  assert.equal(permit.executor, 'z620-linux-amd64');
  assert.equal(permit.automaticPush, false);
  assert.equal(verifyPermit(permit, { key: 'test-key', currentSha: sha, now: 2_000 }), true);
});

test('changed SHA and expiration invalidate an otherwise valid permit', () => {
  const permit = issuePermit(input, { key: 'test-key', now: 1_000, ttlMs: 5_000 });
  assert.equal(
    verifyPermit(permit, { key: 'test-key', currentSha: `a${sha.slice(1)}`, now: 2_000 }),
    false
  );
  assert.equal(verifyPermit(permit, { key: 'test-key', currentSha: sha, now: 6_000 }), false);
});

test('failure, skip, provider red, dirty state and bad checksum deny permits', () => {
  const broken = {
    ...input,
    clean: false,
    checksumsValid: false,
    providers: { sonar: 'fail' },
    requiredResults: [{ id: 'e2e', status: 'skipped' }],
  };
  assert.deepEqual(permitProblems(broken), [
    'dirty_candidate',
    'invalid_checksums',
    'required_result:e2e',
    'provider:sonar',
  ]);
  assert.throws(() => issuePermit(broken, { key: 'test-key' }), /denied/u);
});

test('Mac diagnostic fallback cannot issue a Z620 push permit', () => {
  const fallbackInput = { ...input, executor: 'macos-arm64-diagnostic' };
  assert.deepEqual(permitProblems(fallbackInput), ['invalid_executor']);
  assert.throws(() => issuePermit(fallbackInput, { key: 'test-key' }), /invalid_executor/u);
});

test('executor tampering invalidates a signed permit', () => {
  const permit = issuePermit(input, { key: 'test-key', now: 1_000, ttlMs: 5_000 });
  const tampered = { ...permit, executor: 'macos-arm64-diagnostic' };
  assert.equal(verifyPermit(tampered, { key: 'test-key', currentSha: sha, now: 2_000 }), false);
});

test('malformed signatures fail closed without throwing', () => {
  const permit = issuePermit(input, { key: 'test-key', now: 1_000, ttlMs: 5_000 });
  assert.equal(
    verifyPermit({ ...permit, signature: 'not-hex' }, { key: 'test-key', currentSha: sha }),
    false
  );
});
