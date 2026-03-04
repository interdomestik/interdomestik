import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateBoundaryContract } from './boundary-contract-check.mjs';

test('advisory mode marks rollback hint on no-touch violations without forcing non-zero exit', () => {
  const result = evaluateBoundaryContract(
    {
      summary: {
        no_touch_touched: 1,
        protected_touched: 0,
        advisory_watch_touched: 0,
        unclassified: 0,
      },
    },
    'advisory'
  );

  assert.equal(result.contract_status, 'fail');
  assert.equal(result.decision_hint, 'rollback');
  assert.equal(result.should_exit_nonzero, false);
});

test('enforced mode requests non-zero exit on no-touch violations', () => {
  const result = evaluateBoundaryContract(
    {
      summary: {
        no_touch_touched: 1,
        protected_touched: 0,
      },
    },
    'enforced'
  );

  assert.equal(result.contract_status, 'fail');
  assert.equal(result.should_exit_nonzero, true);
});

test('protected-only changes produce pause hint', () => {
  const result = evaluateBoundaryContract(
    {
      summary: {
        no_touch_touched: 0,
        protected_touched: 2,
      },
    },
    'advisory'
  );

  assert.equal(result.contract_status, 'warn');
  assert.equal(result.decision_hint, 'pause');
  assert.equal(result.should_exit_nonzero, false);
});
