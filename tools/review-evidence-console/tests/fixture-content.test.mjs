import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import { assignments } from './validation-fixtures.mjs';

async function loadItems() {
  const repository = createFixtureRepository();
  const bundles = await Promise.all(
    assignments.map(({ id }) => repository.loadAssignmentBundle(id))
  );
  return bundles.flatMap(result => result.value.packet.items);
}

const keys = (items, id) =>
  items.find(item => item.id === id).requiredResponses.map(entry => entry.key);
const response = (items, id, key) =>
  items.find(item => item.id === id).requiredResponses.find(entry => entry.key === key);

test('ships complete review fields and required MOB-03a descriptors', async () => {
  const items = await loadItems();
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
  assert.deepEqual(keys(items, 'M03A-CONSENT-FIELDS'), [
    'acceptedMinimumFields',
    'additions',
    'excludedFields',
  ]);
  assert.deepEqual(keys(items, 'M03A-ACCESS-ROLES'), [
    'memberDecision',
    'internalCaseRoleDecision',
    'sponsorDecision',
    'payerDecision',
    'externalPartyDecision',
  ]);
  assert.deepEqual(keys(items, 'M03A-DOCUMENT-BOUNDARY'), [
    'allowedMetadata',
    'forbiddenCategories',
  ]);
  assert.deepEqual(keys(items, 'M03A-SCOPE-STOPS'), [
    'allowedScope',
    'excludedScope',
    'stopCondition',
  ]);
  const documentBoundary = items.find(item => item.id === 'M03A-DOCUMENT-BOUNDARY');
  const forbidden = documentBoundary.requiredResponses.find(
    entry => entry.key === 'forbiddenCategories'
  );
  assert.equal(forbidden.type, 'checkbox_group');
  assert.ok(forbidden.options.length > 1);
});

test('ships complete privacy-owner response descriptors', async () => {
  const items = await loadItems();
  assert.deepEqual(keys(items, 'M03A-PRIVACY-OWNER'), [
    'ownerDisplayName',
    'ownerRole',
    'decisionDate',
    'ownerEvidenceRef',
    'reviewerRole',
  ]);
  assert.deepEqual(
    ['decisionDate', 'ownerEvidenceRef', 'reviewerRole'].map(key => [
      key,
      response(items, 'M03A-PRIVACY-OWNER', key)?.type,
    ]),
    [
      ['decisionDate', 'date'],
      ['ownerEvidenceRef', 'evidenceRef'],
      ['reviewerRole', 'text'],
    ]
  );
});

test('ships conditional DPIA and Article 9 evidence descriptor', async () => {
  const items = await loadItems();
  assert.deepEqual(keys(items, 'M03A-MEDICAL-BOUNDARY'), [
    'medicalBoundary',
    'disabledScope',
    'dpiaRef',
  ]);
  assert.deepEqual(response(items, 'M03A-MEDICAL-BOUNDARY', 'dpiaRef'), {
    key: 'dpiaRef',
    labelSq: 'Referenca e evidencës DPIA / Neni 9',
    type: 'evidenceRef',
    required: true,
    maxLength: 160,
    options: [],
    requiredWhen: { key: 'medicalBoundary', equals: 'allowed' },
  });
});

test('ships the repo-safe threat-recheck evidence descriptor', async () => {
  const items = await loadItems();
  assert.deepEqual(keys(items, 'M03A-THREAT-RECHECK'), [
    'threatAreas',
    'recheckOutcome',
    'threatRecheckEvidenceRef',
  ]);
  assert.deepEqual(response(items, 'M03A-THREAT-RECHECK', 'threatRecheckEvidenceRef'), {
    key: 'threatRecheckEvidenceRef',
    labelSq: 'Referenca e evidencës së rikontrollit',
    type: 'evidenceRef',
    required: true,
    maxLength: 160,
    options: [],
  });
});
