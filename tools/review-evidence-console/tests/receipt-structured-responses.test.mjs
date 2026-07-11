import assert from 'node:assert/strict';
import test from 'node:test';

import { createReviewRouteLoaders } from '../public/src/app/review-routes.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { renderReceipt } from '../public/src/views/receipt.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { makeStorage, receiptInput, submittedAt } from './state-fixtures.mjs';

setDocument(fakeDocument);

const packet = {
  id: receiptInput.packetId,
  version: receiptInput.packetVersion,
  items: [
    {
      id: 'item_a',
      requiredResponses: [
        descriptor('ownerRole', 'Roli i pronarit', 'text'),
        descriptor('medicalBoundary', 'Kufiri mjekësor', 'select', ['excluded', 'allowed'], {
          excluded: 'Përjashto',
          allowed: 'Lejo',
        }),
        descriptor('decisionDate', 'Data e vendimit', 'date'),
        descriptor('ownerEvidenceRef', 'Referenca e evidencës', 'evidenceRef'),
      ],
    },
  ],
};

test('formats structured responses from field descriptors without free-text collisions', async () => {
  const receipt = await structuredReceipt();
  const before = JSON.stringify(receipt);
  const node = renderReceipt({ receipt, packet });
  assert.match(responseCopy(node, 'ownerRole'), /Roli i pronarit.*ownerRole.*access/s);
  assert.doesNotMatch(responseCopy(node, 'ownerRole'), /Qasja/);
  assert.match(
    responseCopy(node, 'medicalBoundary'),
    /Kufiri mjekësor.*medicalBoundary.*Përjashto.*excluded/s
  );
  assert.match(responseCopy(node, 'decisionDate'), /Data e vendimit.*2026-07-09/s);
  assert.match(responseCopy(node, 'ownerEvidenceRef'), /docs\/review.md#L1/s);
  for (const key of ['ownerRole', 'decisionDate', 'ownerEvidenceRef']) {
    const codes = walk(responseRow(node, key)).filter(entry => entry.tagName === 'CODE');
    assert.deepEqual(
      codes.map(entry => copy(entry).trim()),
      [key]
    );
    assert.ok(codes.every(entry => entry.attributes.lang === 'en'));
  }
  assert.equal(JSON.stringify(receipt), before);
});

test('receipt route loads and passes validated packet descriptor context', async () => {
  globalThis.localStorage = makeStorage();
  let contextLoads = 0;
  let rendered;
  const loaders = createReviewRouteLoaders({
    repository: {
      loadAssignmentBundle: async () => (contextLoads++, { ok: true, value: { packet } }),
    },
    render: content => (rendered = content[0]),
    navigate() {},
    isCurrent: () => true,
  });
  const receipt = await structuredReceipt();
  await loaders.receiptStore.save(receipt);
  await loaders.receipt({ receiptId: receipt.receiptId }, 1);
  assert.equal(contextLoads, 1);
  assert.match(responseCopy(rendered, 'ownerRole'), /Roli i pronarit.*access/s);
});

test('keeps structured responses separate from decision sidecar state', async () => {
  const input = structuredClone(receiptInput);
  input.decisions.item_a.responses = {
    ownerRole: 'Wrong retained response',
    contextualNoteState: { status: 'retained' },
  };
  input.decisions.item_a.statuses = { ownerRole: 'retained' };
  input.structuredResponses.item_a = { ownerRole: 'Canonical response' };
  const receipt = await buildReceipt({ ...input, submittedAt });
  assert.deepEqual(receipt.structuredResponses.item_a, { ownerRole: 'Canonical response' });
  assert.equal(Object.hasOwn(receipt.decisions.item_a, 'responses'), false);
  assert.equal(Object.hasOwn(receipt.decisions.item_a, 'statuses'), false);
});

async function structuredReceipt() {
  return buildReceipt({
    ...receiptInput,
    structuredResponses: {
      item_a: {
        ownerRole: 'access',
        medicalBoundary: 'excluded',
        decisionDate: '2026-07-09',
        ownerEvidenceRef: 'docs/review.md#L1',
      },
    },
    submittedAt,
  });
}

function descriptor(key, labelSq, type, options = [], optionLabelsSq = {}) {
  return { key, labelSq, type, options, optionLabelsSq };
}

function responseRow(node, key) {
  return walk(node).find(
    entry =>
      entry.tagName === 'P' &&
      walk(entry).some(child => child.tagName === 'CODE' && copy(child).trim() === key)
  );
}

const responseCopy = (node, key) => copy(responseRow(node, key));
