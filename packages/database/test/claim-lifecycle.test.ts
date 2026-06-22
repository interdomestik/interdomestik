import assert from 'node:assert/strict';
import test from 'node:test';

import { CLAIM_STATUSES } from '../src/constants';
import {
  CLAIM_STATUS_LIFECYCLE_FIELDS,
  claimLifecycleFieldsForStatus,
} from '../src/claim-lifecycle';
import { withClaimLifecycleFields } from '../src/seed-utils/claim-lifecycle';

test('claim lifecycle helper covers every status and fixture state', () => {
  assert.deepEqual(Object.keys(CLAIM_STATUS_LIFECYCLE_FIELDS).sort(), [...CLAIM_STATUSES].sort());
  assert.deepEqual(claimLifecycleFieldsForStatus('submitted'), {
    caseLifecycleState: 'submitted',
    recoveryLifecycleState: 'not_started',
  });
  assert.deepEqual(claimLifecycleFieldsForStatus('negotiation'), {
    caseLifecycleState: 'recovery',
    recoveryLifecycleState: 'negotiation',
  });
  assert.deepEqual(claimLifecycleFieldsForStatus('rejected'), {
    caseLifecycleState: 'rejected',
    recoveryLifecycleState: 'closed',
  });
});

test('seed helper hardens status-shaped claim fixture rows', () => {
  assert.deepEqual(withClaimLifecycleFields({ id: 'claim-1', status: 'resolved' }), {
    id: 'claim-1',
    status: 'resolved',
    caseLifecycleState: 'resolved',
    recoveryLifecycleState: 'resolved',
  });
});
