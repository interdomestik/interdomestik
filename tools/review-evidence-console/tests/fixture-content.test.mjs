import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import { assignments } from './validation-fixtures.mjs';

async function loadItems() {
  const repository = createFixtureRepository();
  const bundles = await Promise.all(assignments.map(({ id }) => repository.loadAssignmentBundle(id)));
  return bundles.flatMap(result => result.value.packet.items);
}
const find = (items, id) => items.find(item => item.id === id);
const keys = (items, id) => find(items, id).requiredResponses.map(entry => entry.key);
const response = (items, id, key) =>
  find(items, id).requiredResponses.find(entry => entry.key === key);
const evidence = 'docs/plans/2026-07-09-mob-dg04-next-slice-current-authority.md';
const suggestion = (concreteAnswer, reason, riskCategory, responses, useSessionDateFor) => ({
  concreteAnswer,
  reason,
  evidenceRef: evidence,
  riskCategory,
  severity: 'high',
  responses,
  useSessionDateFor: useSessionDateFor ?? ['verifiedAt'],
});
const expectedSuggestions = {
  'M03A-MEDICAL-BOUNDARY': suggestion(
    'Të dhënat mjekësore dhe të lëndimeve mbeten të përjashtuara.',
    'Nuk ka autoritet të nënshkruar ose të pranuar DPIA/Neni 9.',
    'privacy',
    {
      medicalBoundary: 'excluded',
      disabledScope:
        'Çaktivizo pranimin, shfaqjen, ngarkimin, ruajtjen dhe përpunimin e të dhënave mjekësore ose të lëndimeve.',
    }
  ),
  'M03A-CONSENT-FIELDS': suggestion(
    'Prano vetëm metadata-t minimale të pëlqimit si kërkesë shqyrtimi.',
    'Fushat e pranuara nuk japin autoritet për schema ose runtime.',
    'compliance',
    {
      acceptedMinimumFields: ['consentStatus', 'recordedAt', 'consentVersion'],
      additions: 'Asnjë shtesë pa autoritet të ri.',
      excludedFields: 'Dokumente burimore dhe të dhëna mjekësore, ligjore private ose pagese.',
    }
  ),
  'M03A-ACCESS-ROLES': suggestion(
    'Lejo vetëm metadata të kufizuara për anëtarin dhe rolin e brendshëm të rastit.',
    'Qasja për sponsorin, paguesin dhe palët e jashtme nuk ka autoritet të pranuar.',
    'access',
    {
      memberDecision: 'view', internalCaseRoleDecision: 'view', sponsorDecision: 'exclude',
      payerDecision: 'exclude', externalPartyDecision: 'exclude',
    }
  ),
  'M03A-DOCUMENT-BOUNDARY': suggestion(
    'Shfaq vetëm metadata; mos shfaq përmbajtjen e dokumentit burimor.',
    'Fixture-i duhet të ruajë kufirin e dokumenteve.',
    'privacy',
    {
      allowedMetadata: ['state', 'category', 'updatedAt'],
      forbiddenCategories: ['raw_document', 'payment', 'medical', 'legal_private'],
    }
  ),
  'M03A-THREAT-RECHECK': suggestion(
    'Rikontrollo qasjen, ruajtjen dhe zbulimin para çdo promovimi runtime.',
    'Gate-i aktual e shënon provën e konsoliduar të kërcënimeve si të munguar.',
    'security',
    {
      threatAreas: ['access', 'retention', 'disclosure'], recheckOutcome: 'stop',
      threatRecheckEvidenceRef: evidence,
    }
  ),
  'M03A-ERASURE-REVOCATION': suggestion(
    'Fshih metadata-t pas fshirjes ose revokimit.',
    'Të dhënat e revokuara nuk duhet të mbeten të dukshme.',
    'privacy',
    { renderingRule: 'hide_metadata' }
  ),
  'M03A-SCOPE-STOPS': suggestion(
    'Kufizo planifikimin te metadata jo-mjekësore për automjet dhe pronë.',
    'Runtime, të dhënat sensitive dhe zgjerimi i autoritetit mbeten jashtë fixture-it.',
    'scope',
    {
      allowedScope: 'Vetëm planifikim i shfaqjes së metadata-ve për automjet dhe pronë, pa runtime.',
      excludedScope:
        'Të dhëna mjekësore ose lëndimesh, dokumente burimore, auth, schema, RLS dhe shkrues runtime.',
      stopCondition: 'missing_authority',
    }
  ),
};

test('ships exact normalized reviewer suggestions', async () => {
  const items = await loadItems();
  for (const [id, expected] of Object.entries(expectedSuggestions)) {
    const { requestedChange, conditionalResponses, ...normalized } =
      find(items, id).suggestedReview;
    assert.deepEqual(normalized, expected);
    assert.ok(requestedChange.trim());
  }
});

test('ships complete review fields and canonical response descriptors', async () => {
  const items = await loadItems();
  assert.deepEqual(find(items, 'M03A-PRIVACY-OWNER').baseFields, [
    'decision', 'concreteAnswer', 'reason', 'evidenceRef', 'verifiedAt',
    'riskCategory', 'severity', 'requestedChange',
  ]);
  const expected = {
    'M03A-CONSENT-FIELDS': ['acceptedMinimumFields', 'additions', 'excludedFields'],
    'M03A-ACCESS-ROLES': [
      'memberDecision', 'internalCaseRoleDecision', 'sponsorDecision',
      'payerDecision', 'externalPartyDecision',
    ],
    'M03A-DOCUMENT-BOUNDARY': ['allowedMetadata', 'forbiddenCategories'],
    'M03A-SCOPE-STOPS': ['allowedScope', 'excludedScope', 'stopCondition'],
  };
  for (const [id, expectedKeys] of Object.entries(expected)) assert.deepEqual(keys(items, id), expectedKeys);
  assert.equal(response(items, 'M03A-DOCUMENT-BOUNDARY', 'forbiddenCategories').type, 'checkbox_group');
});

test('ships exact Albanian option labels and assignment display copy', async () => {
  const items = await loadItems();
  for (const descriptor of items.flatMap(item => item.requiredResponses)) {
    assert.deepEqual(Object.keys(descriptor.optionLabelsSq), descriptor.options);
    assert.ok(Object.values(descriptor.optionLabelsSq).every(label => label.trim()));
  }
  const listed = await createFixtureRepository().listAssignments('reviewer_privacy_mk');
  assert.deepEqual(listed.value.map(({ titleSq }) => titleSq), [
    'Rishikimi i autoritetit — Pjesa A', 'Rishikimi i autoritetit — Pjesa B',
  ]);
});

test('preserves owner, conditional DPIA, and threat evidence descriptors', async () => {
  const items = await loadItems();
  assert.deepEqual(keys(items, 'M03A-PRIVACY-OWNER'), [
    'ownerDisplayName', 'ownerRole', 'decisionDate', 'ownerEvidenceRef', 'reviewerRole',
  ]);
  const dpia = response(items, 'M03A-MEDICAL-BOUNDARY', 'dpiaRef');
  assert.deepEqual(dpia.requiredWhen, { key: 'medicalBoundary', equals: 'allowed' });
  assert.equal(dpia.type, 'evidenceRef');
  assert.equal(response(items, 'M03A-THREAT-RECHECK', 'threatRecheckEvidenceRef').type, 'evidenceRef');
});
