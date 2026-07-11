import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewRouteLoaders } from '../public/src/app/review-routes.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { copy, fakeDocument, FakeNode, walk } from './fake-dom.mjs';
import { makeStorage, receiptInput, submittedAt } from './state-fixtures.mjs';

setDocument(fakeDocument);

const packet = {
  id: receiptInput.packetId,
  version: receiptInput.packetVersion,
  items: [
    {
      id: 'item_a',
      requiredResponses: [{ key: 'ownerRole', labelSq: 'Roli i pronarit', type: 'text' }],
    },
  ],
};

function setup(packetOverride = packet) {
  const base = makeStorage();
  let failStorage = false;
  const storage = {
    get length() {
      return base.length;
    },
    key: base.key,
    getItem: key => {
      if (failStorage) throw new Error('private');
      return base.getItem(key);
    },
    setItem: base.setItem,
    removeItem: key => {
      if (failStorage) throw new Error('private');
      return base.removeItem(key);
    },
  };
  globalThis.localStorage = storage;
  const renders = [];
  const navigations = [];
  const loaders = createReviewRouteLoaders({
    repository: {
      loadAssignmentBundle: async () => ({ ok: true, value: { packet: packetOverride } }),
    },
    isCurrent: token => token === 1,
    render: (content, role, focus) => renders.push({ content, focus }),
    navigate: route => navigations.push(route),
  });
  return {
    base,
    loaders,
    navigations,
    renders,
    fail: () => {
      failStorage = true;
    },
  };
}

function nodes(content) {
  const root = new FakeNode('div');
  root.append(...content.filter(Boolean));
  return walk(root);
}

test('focuses receipt then correction headings on deliberate view changes', async () => {
  const context = setup();
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await context.loaders.receiptStore.save(receipt);
  await context.loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  assert.equal(context.renders.at(-1).focus, 'receipt-heading');
  const button = nodes(context.renders.at(-1).content).find(
    node => copy(node).includes('Krijo korrigjim') && node.tagName === 'BUTTON'
  );
  button.listeners.click();
  assert.equal(context.renders.at(-1).focus, 'correction-heading');
});

test('returns from a completed Part A receipt to the packet list', async () => {
  const context = setup();
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await context.loaders.receiptStore.save(receipt);
  await context.loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  const button = nodes(context.renders.at(-1).content).find(
    node =>
      node.tagName === 'BUTTON' && copy(node).trim() === 'Kthehu te paketat — vazhdo me Pjesën B'
  );
  assert.ok(button, 'receipt should expose a return-to-packets action');
  button.listeners.click();
  assert.deepEqual(context.navigations, [{ name: 'inbox' }]);
});

test('returns from a completed Part B receipt with the generic label', async () => {
  const partB = { ...packet, id: 'mob-03a-part-b' };
  const context = setup(partB);
  const receipt = await buildReceipt({ ...receiptInput, packetId: partB.id, submittedAt });
  await context.loaders.receiptStore.save(receipt);
  await context.loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  const button = nodes(context.renders.at(-1).content).find(
    node => node.tagName === 'BUTTON' && copy(node).trim() === 'Kthehu te paketat'
  );
  assert.ok(button);
  button.listeners.click();
  assert.deepEqual(context.navigations, [{ name: 'inbox' }]);
});

test('keeps receipt visible and reports delete and export storage failures', async () => {
  const context = setup();
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await context.loaders.receiptStore.save(receipt);
  context.base.setItem('review-console:v1:draft:assign_a:reviewer_a:1', 'draft');
  await context.loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  context.fail();
  let confirmation;
  globalThis.confirm = message => ((confirmation = message), true);
  let current = nodes(context.renders.at(-1).content);
  current
    .find(node => node.tagName === 'BUTTON' && copy(node).includes('Pastro'))
    .listeners.click();
  assert.match(confirmation, /Të pastrohet vërtetimi .* Draftet do të ruhen/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.navigations.length, 0);
  assert.match(copy(nodes(context.renders.at(-1).content)[0]), /Ruajtja lokale nuk është/);
  current = nodes(context.renders.at(-1).content);
  current
    .find(node => node.tagName === 'BUTTON' && copy(node).includes('Eksporto'))
    .listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(copy(nodes(context.renders.at(-1).content)[0]), /Ruajtja lokale nuk është/);
  assert.equal(context.base.getItem('review-console:v1:draft:assign_a:reviewer_a:1'), 'draft');
});
