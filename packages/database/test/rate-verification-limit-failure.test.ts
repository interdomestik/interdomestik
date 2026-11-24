import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';

import { RateVerificationLimitPrivilegedRoleError } from '../src/scripts/rate-verification-limit';
import { formatRateVerificationLimitFailure } from '../src/scripts/rate-verification-limit-failure';

test('reports a privileged release login refusal without values', () => {
  const error = new RateVerificationLimitPrivilegedRoleError();
  error.message += ' postgresql://fixture@localhost/app supplied-role';
  assert.equal(
    formatRateVerificationLimitFailure(error),
    'Rate verification limit operation failed (RateVerificationLimitPrivilegedRoleError)'
  );
});

test('reports a PostgreSQL check violation without its message or values', () => {
  const error = Reflect.construct(postgres.PostgresError, [
    {
      code: '23514',
      constraint_name: 'wp07_reject_test_receipt',
      message: 'postgresql://fixture@localhost/app rejected a supplied value',
      detail: 'The failing row contains a supplied value',
    },
  ]);

  assert.equal(
    formatRateVerificationLimitFailure(error),
    'Rate verification limit operation failed (PostgresError, code=23514, constraint_name=wp07_reject_test_receipt)'
  );
});

test('reports a connection SQLSTATE without a constraint or message', () => {
  const error = Reflect.construct(postgres.PostgresError, [
    {
      code: '08006',
      message: 'postgresql://fixture@localhost/app connection failed',
    },
  ]);

  assert.equal(
    formatRateVerificationLimitFailure(error),
    'Rate verification limit operation failed (PostgresError, code=08006)'
  );
});

test('keeps the guarded target refusal and rejects value-shaped diagnostics', () => {
  assert.equal(
    formatRateVerificationLimitFailure(new Error('Seed target refused: non-disposable')),
    'Seed target refused: non-disposable (Error)'
  );
  const error = Object.assign(new TypeError('postgresql://fixture@localhost/app'), {
    code: 'postgresql://fixture@localhost/app',
    constraint_name: 'a supplied value',
  });
  assert.equal(
    formatRateVerificationLimitFailure(error),
    'Rate verification limit operation failed (TypeError)'
  );
});
