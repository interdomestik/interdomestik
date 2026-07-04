import assert from 'node:assert/strict';
import test from 'node:test';

import { CLAIM_STATUSES } from '../src/constants';
import {
  CLAIM_STATUS_LIFECYCLE_FIELDS,
  claimLifecycleFieldsForStatus,
  claimStatusFromLifecycleFields,
} from '../src/claim-lifecycle';
import { withClaimLifecycleFields } from '../src/seed-utils/claim-lifecycle';

test('claim lifecycle helpers stay aligned', () => {
  assert.deepEqual(
    Object.keys(CLAIM_STATUS_LIFECYCLE_FIELDS).sort((left, right) => left.localeCompare(right)),
    [...CLAIM_STATUSES].sort((left, right) => left.localeCompare(right))
  );
  for (const status of CLAIM_STATUSES) {
    assert.equal(claimStatusFromLifecycleFields(claimLifecycleFieldsForStatus(status)), status);
  }
});

test('seed helper drops legacy status and invalid pairs throw', () => {
  assert.deepEqual(withClaimLifecycleFields({ id: 'claim-1', status: 'resolved' }), {
    id: 'claim-1',
    caseLifecycleState: 'resolved',
    recoveryLifecycleState: 'resolved',
  });
  assert.throws(
    () =>
      claimStatusFromLifecycleFields({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'not_started',
      }),
    /Invalid claim lifecycle state pair: recovery:not_started/u
  );
});
