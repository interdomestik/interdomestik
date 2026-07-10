import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import { assignments } from './validation-fixtures.mjs';

test('ships complete review fields and required MOB-03a descriptors', async () => {
  const repository = createFixtureRepository();
  const bundles = await Promise.all(
    assignments.map(({ id }) => repository.loadAssignmentBundle(id))
  );
  const items = bundles.flatMap(result => result.value.packet.items);
  const keys = id => items.find(item => item.id === id).requiredResponses.map(entry => entry.key);
  assert.deepEqual(items[0].baseFields, [
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
    'riskCategory',
    'severity',
    'requestedChange',
  ]);
  assert.deepEqual(keys('M03A-PRIVACY-OWNER'), ['ownerDisplayName', 'ownerRole']);
  assert.deepEqual(keys('M03A-CONSENT-FIELDS'), [
    'acceptedMinimumFields',
    'additions',
    'excludedFields',
  ]);
  assert.deepEqual(keys('M03A-ACCESS-ROLES'), [
    'memberDecision',
    'internalCaseRoleDecision',
    'sponsorDecision',
    'payerDecision',
    'externalPartyDecision',
  ]);
  assert.deepEqual(keys('M03A-DOCUMENT-BOUNDARY'), ['allowedMetadata', 'forbiddenCategories']);
  assert.deepEqual(keys('M03A-SCOPE-STOPS'), ['allowedScope', 'excludedScope', 'stopCondition']);
  const documentBoundary = items.find(item => item.id === 'M03A-DOCUMENT-BOUNDARY');
  const forbidden = documentBoundary.requiredResponses.find(
    entry => entry.key === 'forbiddenCategories'
  );
  assert.equal(forbidden.type, 'checkbox_group');
  assert.ok(forbidden.options.length > 1);
});
