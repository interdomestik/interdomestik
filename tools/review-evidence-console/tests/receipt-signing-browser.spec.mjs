import { createRequire } from 'node:module';

import { createReviewSession } from '../public/src/state/review-session.mjs';
import { createFixtureService } from '../server/fixture-service.mjs';
import {
  browserAccount,
  loginReviewer,
  startBrowserPortalServer,
} from './browser-auth-fixture.mjs';

const requireFromWeb = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const { expect, test } = requireFromWeb('@playwright/test');
let origin;
let server;

test.beforeAll(async () => ({ origin, server } = await startBrowserPortalServer()));
test.afterAll(async () => new Promise(resolve => server.close(resolve)));

async function submission() {
  const loaded = await createFixtureService().loadAssignment(
    browserAccount,
    'assign_mob03a_part_a'
  );
  const session = createReviewSession(loaded.value, undefined, {
    getLocalDate: () => '2026-07-12',
  });
  for (const itemId of loaded.value.packet.itemIds) session.setDecision(itemId, 'approve');
  const decisions = {};
  const structuredResponses = {};
  for (const [itemId, value] of Object.entries(session.getSnapshot().decisions)) {
    const { responses, ...decision } = value;
    decisions[itemId] = decision;
    structuredResponses[itemId] = responses;
  }
  return {
    assignmentId: loaded.value.assignment.id,
    decisions,
    structuredResponses,
    safeEvidenceConfirmed: true,
  };
}

test('browser receives a server-attributed signed receipt that verifies', async ({ page }) => {
  const requests = [];
  page.on('request', request => {
    if (request.url().includes('/api/receipts')) {
      requests.push([request.method(), new URL(request.url()).pathname, request.postData()]);
    }
  });
  await loginReviewer(page, origin);
  const receipt = await page.evaluate(
    async body => {
      const response = await fetch('/api/receipts', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return response.json();
    },
    await submission()
  );
  expect(receipt.reviewerDisplayName).toBe('Gazmend Abazi');
  expect(receipt.attestation.algorithm).toBe('Ed25519');
  const verified = await page.evaluate(async value => {
    const { createSignedReceiptVerifier } =
      await import('/src/data/receipt-signature-verifier.mjs');
    const verify = createSignedReceiptVerifier(async () => {
      const response = await fetch('/api/receipts/keys', { credentials: 'same-origin' });
      return response.json();
    });
    return verify(value);
  }, receipt);
  expect(verified.ok).toBe(true);
  expect(requests.map(([method, path]) => [method, path])).toEqual([
    ['POST', '/api/receipts'],
    ['GET', '/api/receipts/keys'],
  ]);
  expect(requests[1][2]).toBeNull();
});
