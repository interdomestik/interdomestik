import assert from 'node:assert/strict';
import test from 'node:test';

import { createReviewSession } from '../public/src/state/review-session.mjs';
import { createSessionToken } from '../server/auth/session-token.mjs';
import { createFixtureService } from '../server/fixture-service.mjs';
import { createPortalHandler } from '../server/portal-handler.mjs';
import { createReceiptService } from '../server/receipts/receipt-service.mjs';
import { createTestReceiptKeyring } from './receipt-key-fixtures.mjs';
const origin = 'https://reviewer.example.test';
const secret = Buffer.alloc(32, 8).toString('base64url');
const account = Object.freeze({
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 1,
});
async function judgments(fixtureService) {
  const loaded = await fixtureService.loadAssignment(account, 'assign_mob03a_part_a');
  assert.equal(loaded.ok, true);
  const session = createReviewSession(loaded.value, undefined, {
    getLocalDate: () => '2026-07-12',
  });
  for (const itemId of loaded.value.packet.itemIds) session.setDecision(itemId, 'approve');
  const snapshot = session.getSnapshot();
  const decisions = {};
  const structuredResponses = {};
  for (const [itemId, value] of Object.entries(snapshot.decisions)) {
    const { responses, ...decision } = value;
    decisions[itemId] = decision;
    structuredResponses[itemId] = responses;
  }
  return { assignmentId: loaded.value.assignment.id, decisions, structuredResponses };
}
async function setup() {
  const fixtureService = createFixtureService();
  const receiptService = createReceiptService({
    keyring: await createTestReceiptKeyring(),
    now: () => '2026-07-12T12:00:00.000Z',
  });
  const handler = createPortalHandler({
    registry: { byId: new Map([[account.id, account]]) },
    sessionSecret: secret,
    fixtureService,
    receiptService,
    now: () => 1_800_000_000,
  });
  const token = await createSessionToken(account, {
    secret,
    origin,
    now: () => 1_800_000_000,
  });
  const post = (path, body) =>
    handler(
      new Request(origin + path, {
        method: 'POST',
        headers: {
          origin,
          cookie: `review_portal_session=${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    );
  return { fixtureService, post, receiptService };
}
test('receipt API reconstructs and signs server-owned identity from judgments only', async () => {
  const { fixtureService, post, receiptService } = await setup();
  const response = await post('/api/receipts', {
    ...(await judgments(fixtureService)),
    safeEvidenceConfirmed: true,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const receipt = await response.json();
  assert.equal(receipt.reviewerDisplayName, 'Gazmend Abazi');
  assert.equal(receipt.reviewerFixtureId, 'reviewer_governance_mk');
  assert.equal(receipt.packetId, 'mob-03a-part-a');
  assert.equal(receipt.attestation.algorithm, 'Ed25519');
  assert.equal((await receiptService.verify(receipt)).ok, true);
});
test('receipt API rejects identity and envelope overrides', async () => {
  const { fixtureService, post } = await setup();
  const body = {
    ...(await judgments(fixtureService)),
    safeEvidenceConfirmed: true,
    reviewerDisplayName: 'Attacker',
  };
  const response = await post('/api/receipts', body);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_request' });
});

test('receipt API rejects extra packet fields and invalid correction targets', async () => {
  const { fixtureService, post } = await setup();
  const base = await judgments(fixtureService);
  const extraDecision = {
    ...base,
    decisions: { ...base.decisions, OTHER: base.decisions[Object.keys(base.decisions)[0]] },
    safeEvidenceConfirmed: true,
  };
  assert.equal((await post('/api/receipts', extraDecision)).status, 400);
  const first = await (
    await post('/api/receipts', { ...base, safeEvidenceConfirmed: true })
  ).json();
  assert.equal(first.reviewerAccountId, account.id);
  const invalidCorrection = {
    ...base,
    safeEvidenceConfirmed: true,
    previousReceipt: first,
    correctionItemId: 'OTHER',
    correctionReason: 'Korrigjim',
    correctionImpact: 'Pa ndikim',
  };
  assert.equal((await post('/api/receipts/correct', invalidCorrection)).status, 400);
});

test('correction API verifies prior signature and derives immutable lineage', async () => {
  const { fixtureService, post } = await setup();
  const base = await judgments(fixtureService);
  const first = await (
    await post('/api/receipts', { ...base, safeEvidenceConfirmed: true })
  ).json();
  const correction = {
    ...base,
    safeEvidenceConfirmed: true,
    previousReceipt: first,
    correctionItemId: 'M03A-PRIVACY-OWNER',
    correctionReason: 'Korrigjim i verifikuar',
    correctionImpact: 'Nuk ndryshon kufirin teknik',
  };
  const response = await post('/api/receipts/correct', correction);
  assert.equal(response.status, 200);
  const second = await response.json();
  assert.equal(second.receiptVersion, 2);
  assert.equal(second.previousReceiptId, first.receiptId);
  assert.equal(second.attestation.algorithm, 'Ed25519');

  const tampered = { ...first, packetId: 'mob-03a-part-b' };
  const rejected = await post('/api/receipts/correct', {
    ...correction,
    previousReceipt: tampered,
  });
  assert.equal(rejected.status, 422);
});
