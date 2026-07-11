import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';

const evidence = 'docs/product/2026-07-11-mob-03a-owner-jurisdiction-attestation.md';

test('prefills the separated MK authorities without choosing a decision', async () => {
  const repository = createFixtureRepository();
  const bundle = await repository.loadAssignmentBundle('assign_mob03a_part_a');
  const owner = bundle.value.packet.items.find(item => item.id === 'M03A-PRIVACY-OWNER');

  assert.equal(bundle.value.reviewer.displayName, 'Gazmend Abazi');
  assert.deepEqual(owner.suggestedReview.responses, {
    ownerDisplayName: 'Sanja Jovanovska',
    ownerRole: 'Legal / Privacy Authority, Interdomestik MK',
    ownerEvidenceRef: evidence,
    reviewerRole: 'Independent Business / Governance Reviewer — Gazmend Abazi',
    executiveOwner: 'Fiona Abazi — Executive / Business Owner, Interdomestik MK',
    technicalGuardian: 'Arben Lila — Platform Technical Guardian / consulted',
    runtimeAuthority: 'CA+DG — Current Authority + Design Gate',
  });
  assert.equal(owner.suggestedReview.evidenceRef, evidence);
  assert.equal(Object.hasOwn(owner.suggestedReview, 'decision'), false);
});
