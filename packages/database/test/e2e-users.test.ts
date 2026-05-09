import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_E2E_PASSWORD, getE2EPassword } from '../src/e2e-users';

test('getE2EPassword preserves the deterministic local default', () => {
  assert.equal(getE2EPassword({}), DEFAULT_E2E_PASSWORD);
  assert.equal(getE2EPassword({ E2E_PASSWORD: '' }), DEFAULT_E2E_PASSWORD);
  assert.equal(getE2EPassword({ E2E_PASSWORD: '   ' }), DEFAULT_E2E_PASSWORD);
});

test('getE2EPassword accepts a generated CI override', () => {
  assert.equal(
    getE2EPassword({ E2E_PASSWORD: 'E2e-1234-generated-seed-password!' }),
    'E2e-1234-generated-seed-password!'
  );
});
