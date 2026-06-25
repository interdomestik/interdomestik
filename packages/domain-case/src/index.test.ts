import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CLAIM_STATUSES } from '@interdomestik/database/constants';

import {
  CASE_LIFECYCLE_FIELD,
  CASE_STATUS_LIFECYCLE_STATE_MAP,
  DOMAIN_CASE_BOUNDARY,
  mapCaseStatusToLifecycleState,
} from './index';

test('domain-case exposes a bounded case lifecycle contract', () => {
  assert.equal(DOMAIN_CASE_BOUNDARY, 'domain-case');
  assert.equal(CASE_LIFECYCLE_FIELD, 'claims.case_lifecycle_state');
});

test('domain-case owns the case status to lifecycle mapping', () => {
  assert.deepEqual(
    Object.keys(CASE_STATUS_LIFECYCLE_STATE_MAP).sort((left, right) => left.localeCompare(right)),
    [...CLAIM_STATUSES].sort((left, right) => left.localeCompare(right))
  );
  assert.deepEqual(CASE_STATUS_LIFECYCLE_STATE_MAP, {
    draft: 'draft',
    submitted: 'submitted',
    submitted_to_airline: 'recovery',
    verification: 'verification',
    evaluation: 'evaluation',
    negotiation: 'recovery',
    court: 'recovery',
    resolved: 'resolved',
    rejected: 'rejected',
  });
  assert.equal(mapCaseStatusToLifecycleState('negotiation'), 'recovery');
});
