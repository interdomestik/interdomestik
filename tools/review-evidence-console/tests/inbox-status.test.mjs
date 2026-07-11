import assert from 'node:assert/strict';
import test from 'node:test';

import { loadInboxRows } from '../public/src/views/inbox-data.mjs';

const reviewerId = 'reviewer_a';

function bundle(id, packetId, version = '3', continuesWithAssignmentId) {
  const assignment = {
    id,
    packetId,
    reviewerFixtureId: reviewerId,
    reviewerRole: 'governance',
    status: 'not_started',
    titleSq: `Title ${id}`,
    purposeSq: `Purpose ${id}`,
    ...(continuesWithAssignmentId ? { continuesWithAssignmentId } : {}),
  };
  return {
    assignment,
    reviewer: { id: reviewerId, role: 'governance' },
    packet: { id: packetId, version, reviewerRole: 'governance', itemIds: ['ITEM-1'] },
  };
}

function repositoryFor(...bundles) {
  return {
    listAssignments: async () => ({ ok: true, value: bundles.map(value => value.assignment) }),
    loadAssignmentBundle: async id => ({
      ok: true,
      value: bundles.find(value => value.assignment.id === id),
    }),
  };
}

function receiptFor(value, overrides = {}) {
  return {
    receiptId: `receipt_${value.assignment.id}`,
    submittedAt: '2026-07-10T00:00:00Z',
    assignmentId: value.assignment.id,
    reviewerFixtureId: value.reviewer.id,
    reviewerRole: value.reviewer.role,
    packetId: value.packet.id,
    packetRole: value.packet.reviewerRole,
    packetVersion: value.packet.version,
    ...overrides,
  };
}

test('marks only an explicitly authorized continuation as the next action', async () => {
  const first = bundle('assign_a', 'packet_a', '3', 'assign_c');
  const second = bundle('assign_b', 'packet_b');
  const third = bundle('assign_c', 'packet_c');
  let calls = 0;
  const receiptStore = {
    listAll: async () => {
      calls += 1;
      return { ok: true, value: [receiptFor(first)] };
    },
  };
  const result = await loadInboxRows(repositoryFor(first, second, third), reviewerId, receiptStore);
  assert.equal(calls, 1);
  assert.equal(result.value[0].submissionStatus, 'submitted');
  assert.equal(result.value[0].receiptId, 'receipt_assign_a');
  assert.equal(result.value[1].submissionStatus, null);
  assert.equal(result.value[1].nextAction, undefined);
  assert.equal(result.value[2].submissionStatus, null);
  assert.equal(result.value[2].nextAction, true);
});

test('keeps legacy inbox rows free of receipt status when no store is supplied', async () => {
  const result = await loadInboxRows(repositoryFor(bundle('assign_a', 'packet_a')), reviewerId);
  assert.equal(result.ok, true);
  assert.equal('submissionStatus' in result.value[0], false);
  assert.equal('nextAction' in result.value[0], false);
});

test('invalid receipt evidence fails inbox closed without potentially false statuses', async () => {
  const first = bundle('assign_a', 'packet_a');
  const failure = { ok: false, code: 'hash_mismatch', message: 'Receipt integrity failed.' };
  const result = await loadInboxRows(repositoryFor(first), reviewerId, {
    listAll: async () => failure,
  });
  assert.deepEqual(result, failure);
  assert.equal('value' in result, false);
});

test('fails closed when receipt listing throws', async () => {
  const result = await loadInboxRows(repositoryFor(bundle('assign_a', 'packet_a')), reviewerId, {
    listAll: async () => {
      throw new Error('private storage failed');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unavailable');
});

test('attaches review_required for only stale same-identity receipt evidence', async () => {
  const first = bundle('assign_a', 'packet_a');
  const result = await loadInboxRows(repositoryFor(first), reviewerId, {
    listAll: async () => ({
      ok: true,
      value: [receiptFor(first, { packetVersion: '2' })],
    }),
  });
  assert.equal(result.value[0].submissionStatus, 'review_required');
  assert.equal(result.value[0].nextAction, undefined);
});

test('groups one verified receipt batch for assignments sharing a packet', async () => {
  const first = bundle('assign_a', 'packet_shared');
  const second = bundle('assign_b', 'packet_shared');
  let calls = 0;
  const result = await loadInboxRows(repositoryFor(first, second), reviewerId, {
    listAll: async () => {
      calls += 1;
      return { ok: true, value: [receiptFor(first)] };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(result.value[0].submissionStatus, 'submitted');
  assert.equal(result.value[1].submissionStatus, null);
});
