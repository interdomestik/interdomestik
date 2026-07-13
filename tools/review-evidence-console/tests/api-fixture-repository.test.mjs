import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from './static-fixture-repository.mjs';
import { fixtureCatalog } from '../server/fixtures/catalog.mjs';

test('API repository ignores caller-selected reviewer identity', async () => {
  const calls = [];
  const assignment = fixtureCatalog.assignments[0];
  const packet = fixtureCatalog.packets.find(value => value.id === assignment.packetId);
  const reviewer = fixtureCatalog.reviewers[0];
  const client = {
    session: async () => ({
      displayName: 'Gazmend Abazi',
      role: 'governance',
      fixtureId: 'reviewer_governance_mk',
    }),
    listAssignments: async () => {
      calls.push(['list']);
      return fixtureCatalog.assignments;
    },
    loadAssignment: async id => {
      calls.push(['load', id]);
      return { assignment, packet, reviewer };
    },
  };
  const repository = createFixtureRepository({ client });
  const profile = await repository.loadReviewerProfile('attacker-selected-id');
  const assignments = await repository.listAssignments('attacker-selected-id');
  const bundle = await repository.loadAssignmentBundle(assignment.id);
  assert.equal(profile.value.id, 'reviewer_governance_mk');
  assert.deepEqual(assignments.value, fixtureCatalog.assignments);
  assert.equal(bundle.value.assignment.id, assignment.id);
  assert.deepEqual(calls, [['list'], ['load', assignment.id]]);
});

test('API repository maps typed failures without accepting fallback fixture data', async () => {
  const failure = Object.assign(new Error('private'), { code: 'session_expired' });
  const repository = createFixtureRepository({
    client: {
      session: async () => Promise.reject(failure),
      listAssignments: async () => Promise.reject(failure),
      loadAssignment: async () => Promise.reject(failure),
    },
  });
  assert.deepEqual(await repository.loadReviewerProfile(), {
    ok: false,
    code: 'session_expired',
    message: 'Sesioni ka përfunduar. Hyni përsëri.',
  });
  assert.equal((await repository.listAssignments()).code, 'session_expired');
  assert.equal((await repository.loadAssignmentBundle('assigned')).code, 'session_expired');
});

test('API repository strips browser-owned receipt identity and never uploads local receipt evidence', async () => {
  const calls = [];
  const signed = { receiptId: 'rec_0123456789abcdef01234567', attestation: { keyId: 'test' } };
  const repository = createFixtureRepository({
    client: {
      submitReceipt: async value => {
        calls.push(['submit', value]);
        return signed;
      },
      receiptKeys: async () => {
        calls.push(['keys']);
        throw new Error('Unavailable test key bundle');
      },
      correctReceipt: async value => {
        calls.push(['correct', value]);
        return signed;
      },
    },
  });
  const receipt = await repository.buildReceipt({
    assignmentId: 'assign_mob03a_part_a',
    reviewerDisplayName: 'Attacker override',
    decisions: { ITEM: { decision: 'approve' } },
    structuredResponses: { ITEM: {} },
  });
  assert.deepEqual(receipt, signed);
  assert.deepEqual(calls[0], [
    'submit',
    {
      assignmentId: 'assign_mob03a_part_a',
      decisions: { ITEM: { decision: 'approve' } },
      structuredResponses: { ITEM: {} },
      safeEvidenceConfirmed: true,
    },
  ]);
  const callCount = calls.length;
  assert.equal((await repository.verifyReceipt(signed)).ok, false);
  assert.equal(calls.length, callCount);
  assert.equal(
    calls.some(call => call[0] === 'verify'),
    false
  );
  await repository.buildReceipt({
    assignmentId: 'assign_mob03a_part_a',
    decisions: { ITEM: { decision: 'approve' } },
    structuredResponses: { ITEM: {} },
    previousReceipt: signed,
    correctionItemId: 'ITEM',
    correctionReason: 'Arsye',
    correctionImpact: 'Ndikim',
  });
  assert.equal(calls.at(-1)[0], 'correct');
  assert.deepEqual(Object.keys(calls.at(-1)[1]).sort(), [
    'assignmentId',
    'correctionImpact',
    'correctionItemId',
    'correctionReason',
    'decisions',
    'previousReceipt',
    'safeEvidenceConfirmed',
    'structuredResponses',
  ]);
});
