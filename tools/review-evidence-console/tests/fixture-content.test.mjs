import assert from 'node:assert/strict';
import test from 'node:test';

import { expectedSuggestions } from './fixture-content-expected.mjs';
import { createFixtureRepository } from './static-fixture-repository.mjs';
import { assignments } from './validation-fixtures.mjs';

async function loadItems() {
  const repository = createFixtureRepository();
  const bundles = await Promise.all(
    assignments.map(({ id }) => repository.loadAssignmentBundle(id))
  );
  return bundles.flatMap(result => result.value.packet.items);
}
const find = (items, id) => items.find(item => item.id === id);
const keys = (items, id) => find(items, id).requiredResponses.map(entry => entry.key);
const response = (items, id, key) =>
  find(items, id).requiredResponses.find(entry => entry.key === key);

test('ships exact normalized reviewer suggestions', async () => {
  const items = await loadItems();
  for (const [id, expected] of Object.entries(expectedSuggestions)) {
    const { requestedChange, conditionalResponses, evidenceRef, ...normalized } = find(
      items,
      id
    ).suggestedReview;
    assert.ok(evidenceRef);
    assert.deepEqual(normalized, expected);
    assert.ok(requestedChange.trim());
  }
});

test('ships complete review fields and canonical response descriptors', async () => {
  const items = await loadItems();
  assert.deepEqual(find(items, 'M03A-PRIVACY-OWNER').baseFields, [
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
    'riskCategory',
    'severity',
    'requestedChange',
  ]);
  const expected = {
    'M03A-CONSENT-FIELDS': ['acceptedMinimumFields', 'additions', 'excludedFields'],
    'M03A-ACCESS-ROLES': [
      'memberDecision',
      'internalCaseRoleDecision',
      'sponsorDecision',
      'payerDecision',
      'externalPartyDecision',
    ],
    'M03A-DOCUMENT-BOUNDARY': ['allowedMetadata', 'forbiddenCategories'],
    'M03A-SCOPE-STOPS': ['allowedScope', 'excludedScope', 'stopCondition'],
  };
  for (const [id, expectedKeys] of Object.entries(expected))
    assert.deepEqual(keys(items, id), expectedKeys);
  assert.equal(
    response(items, 'M03A-DOCUMENT-BOUNDARY', 'forbiddenCategories').type,
    'checkbox_group'
  );
});

test('ships exact Albanian option labels and assignment display copy', async () => {
  const items = await loadItems();
  for (const descriptor of items.flatMap(item => item.requiredResponses)) {
    assert.deepEqual(Object.keys(descriptor.optionLabelsSq), descriptor.options);
    assert.ok(Object.values(descriptor.optionLabelsSq).every(label => label.trim()));
  }
  const listed = await createFixtureRepository().listAssignments('reviewer_governance_mk');
  assert.deepEqual(
    listed.value.map(({ titleSq }) => titleSq),
    ['Rishikimi i autoritetit — Pjesa A', 'Rishikimi i autoritetit — Pjesa B']
  );
});

test('preserves owner, conditional DPIA, and threat evidence descriptors', async () => {
  const items = await loadItems();
  assert.deepEqual(keys(items, 'M03A-PRIVACY-OWNER'), [
    'ownerDisplayName',
    'ownerRole',
    'decisionDate',
    'ownerEvidenceRef',
    'reviewerRole',
    'executiveOwner',
    'technicalGuardian',
    'runtimeAuthority',
  ]);
  const dpia = response(items, 'M03A-MEDICAL-BOUNDARY', 'dpiaRef');
  assert.deepEqual(dpia.requiredWhen, { key: 'medicalBoundary', equals: 'allowed' });
  assert.equal(dpia.type, 'evidenceRef');
  assert.equal(
    response(items, 'M03A-THREAT-RECHECK', 'threatRecheckEvidenceRef').type,
    'evidenceRef'
  );
});
