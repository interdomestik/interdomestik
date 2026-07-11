import assert from 'node:assert/strict';
import test from 'node:test';

import { loadInboxRows } from '../public/src/views/inbox-data.mjs';

const reviewerId = 'reviewer_a';

function bundle(id, packetId, version = '3') {
  const assignment = {
    id,
    packetId,
    reviewerFixtureId: reviewerId,
    reviewerRole: 'governance',
    status: 'not_started',
    titleSq: `Title ${id}`,
    purposeSq: `Purpose ${id}`,
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

test('attaches receipt status and marks only the first non-submitted row as next action', async () => {
  const first = bundle('assign_a', 'packet_a');
  const second = bundle('assign_b', 'packet_b');
  const third = bundle('assign_c', 'packet_c');
  const calls = [];
  const receiptStore = {
    list: async packetId => {
      calls.push(packetId);
      return { ok: true, value: packetId === 'packet_a' ? [receiptFor(first)] : [] };
    },
  };
  const result = await loadInboxRows(repositoryFor(first, second, third), reviewerId, receiptStore);
  assert.deepEqual(calls, ['packet_a', 'packet_b', 'packet_c']);
  assert.equal(result.value[0].submissionStatus, 'submitted');
  assert.equal(result.value[0].receiptId, 'receipt_assign_a');
  assert.equal(result.value[1].submissionStatus, null);
  assert.equal(result.value[1].nextAction, true);
  assert.equal(result.value[2].submissionStatus, null);
  assert.equal(result.value[2].nextAction, undefined);
});

test('keeps legacy inbox rows free of receipt status when no store is supplied', async () => {
  const result = await loadInboxRows(repositoryFor(bundle('assign_a', 'packet_a')), reviewerId);
  assert.equal(result.ok, true);
  assert.equal('submissionStatus' in result.value[0], false);
  assert.equal('nextAction' in result.value[0], false);
});

test('fails closed when receipt listing fails', async () => {
  const first = bundle('assign_a', 'packet_a');
  const failure = { ok: false, code: 'hash_mismatch', message: 'Receipt integrity failed.' };
  const result = await loadInboxRows(repositoryFor(first), reviewerId, {
    list: async () => failure,
  });
  assert.deepEqual(result, failure);
});

test('fails closed when receipt listing throws', async () => {
  const result = await loadInboxRows(repositoryFor(bundle('assign_a', 'packet_a')), reviewerId, {
    list: async () => {
      throw new Error('private storage failed');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unavailable');
});

test('attaches review_required for only stale same-identity receipt evidence', async () => {
  const first = bundle('assign_a', 'packet_a');
  const result = await loadInboxRows(repositoryFor(first), reviewerId, {
    list: async () => ({
      ok: true,
      value: [receiptFor(first, { packetVersion: '2' })],
    }),
  });
  assert.equal(result.value[0].submissionStatus, 'review_required');
  assert.equal(result.value[0].nextAction, undefined);
});
