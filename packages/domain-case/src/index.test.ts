import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CASE_LIFECYCLE_FIELD, DOMAIN_CASE_BOUNDARY } from './index';

test('domain-case exposes a bounded case lifecycle contract', () => {
  assert.equal(DOMAIN_CASE_BOUNDARY, 'domain-case');
  assert.equal(CASE_LIFECYCLE_FIELD, 'claims.case_lifecycle_state');
});
