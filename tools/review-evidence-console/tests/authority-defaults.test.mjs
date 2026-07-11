import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';

const owner = 'docs/product/2026-07-11-mob-03a-owner-jurisdiction-attestation.md';
const partA = 'docs/product/2026-07-09-mob-03a-authority-evidence-request-part-a.md';
const partB = 'docs/product/2026-07-09-mob-03a-authority-evidence-request-part-b.md';
const threat = 'docs/product/2026-07-11-mob-03a-targeted-threat-recheck.md';
const expected = {
  'M03A-PRIVACY-OWNER': {
    evidenceRef: owner,
    responses: {
      ownerDisplayName: 'Gazmend Abazi',
      ownerRole: 'Privacy / Legal Owner, Interdomestik MK',
      ownerEvidenceRef: owner,
      reviewerRole: 'Independent reviewer — Arben Lila',
    },
  },
  'M03A-MEDICAL-BOUNDARY': {
    evidenceRef: partA,
    responses: { medicalBoundary: 'excluded' },
  },
  'M03A-CONSENT-FIELDS': {
    evidenceRef: partA,
    responses: {
      acceptedMinimumFields: ['consentStatus', 'recordedAt', 'consentVersion'],
      additions: 'Asnjë shtesë pa autoritet të ri.',
    },
  },
  'M03A-ACCESS-ROLES': {
    evidenceRef: partA,
    responses: {
      memberDecision: 'view',
      internalCaseRoleDecision: 'view',
      sponsorDecision: 'exclude',
      payerDecision: 'exclude',
      externalPartyDecision: 'exclude',
    },
  },
  'M03A-DOCUMENT-BOUNDARY': {
    evidenceRef: partB,
    responses: {
      allowedMetadata: ['state', 'category', 'updatedAt'],
      forbiddenCategories: ['raw_document', 'payment', 'medical', 'legal_private'],
    },
  },
  'M03A-THREAT-RECHECK': {
    evidenceRef: threat,
    responses: {
      threatAreas: ['access', 'retention', 'disclosure'],
      recheckOutcome: 'clear',
      threatRecheckEvidenceRef: threat,
    },
  },
  'M03A-ERASURE-REVOCATION': {
    evidenceRef: partB,
    responses: { renderingRule: 'hide_metadata' },
  },
  'M03A-SCOPE-STOPS': {
    evidenceRef: partB,
    responses: { stopCondition: 'missing_authority' },
  },
};

test('prefills every MOB-03a item from specific authority evidence without auto-approval', async () => {
  const repository = createFixtureRepository();
  const bundles = await Promise.all([
    repository.loadAssignmentBundle('assign_mob03a_part_a'),
    repository.loadAssignmentBundle('assign_mob03a_part_b'),
  ]);
  const items = bundles.flatMap(bundle => bundle.value.packet.items);

  for (const item of items) {
    const wanted = expected[item.id];
    assert.equal(item.suggestedReview.evidenceRef, wanted.evidenceRef, item.id);
    assert.equal(Object.hasOwn(item.suggestedReview, 'decision'), false, item.id);
    for (const [key, value] of Object.entries(wanted.responses)) {
      assert.deepEqual(item.suggestedReview.responses[key], value, `${item.id}.${key}`);
    }
  }
  for (const evidenceRef of new Set(Object.values(expected).map(value => value.evidenceRef))) {
    await access(new URL(`../../../${evidenceRef}`, import.meta.url));
  }
});
