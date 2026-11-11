import assert from 'node:assert/strict';
import test from 'node:test';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const FIXTURE_ROOT = 'packages/domain-communications/src/email/fixtures';

test('One Door owns only the two retained main email fixtures', () => {
  for (const name of ['auth-main', 'stored-main']) {
    assert.equal(
      structuredArtifactOwner(`${FIXTURE_ROOT}/${name}.json`),
      'one-door-email-main-fixtures-contract'
    );
  }
  for (const file of [
    `${FIXTURE_ROOT}/other-main.json`,
    `${FIXTURE_ROOT}/auth-main-extra.json`,
    `${FIXTURE_ROOT}/nested/auth-main.json`,
    'packages/domain-communications/src/other/fixtures/auth-main.json',
  ]) {
    assert.equal(structuredArtifactOwner(file), null);
  }
});
