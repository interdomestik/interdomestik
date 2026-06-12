import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DOMAIN_RECOVERY_BOUNDARY, RECOVERY_LIFECYCLE_FIELD } from './index';

test('domain-recovery exposes a bounded recovery lifecycle contract', () => {
  assert.equal(DOMAIN_RECOVERY_BOUNDARY, 'domain-recovery');
  assert.equal(RECOVERY_LIFECYCLE_FIELD, 'claims.recovery_lifecycle_state');
});
