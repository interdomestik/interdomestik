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
  items: [{ id: 'item_a', requiredResponses: [] }],
};

function nodes(content) {
  const root = new FakeNode('div');
  root.append(...content.filter(Boolean));
  return walk(root);
}

test('saves the loaded receipt to the selected private inbox and redraws status', async () => {
  globalThis.localStorage = makeStorage();
  const renders = [];
  const saved = [];
  const directoryWriter = {
    supported: true,
    async save(receipt) {
      saved.push(receipt);
      return { ok: true, code: 'saved', message: 'Receipt-i u ruajt në inbox-in privat.' };
    },
  };
  const loaders = createReviewRouteLoaders({
    repository: {
      loadAssignmentBundle: async () => ({ ok: true, value: { packet } }),
    },
    directoryWriter,
    isCurrent: token => token === 1,
    render: content => renders.push(content),
    navigate() {},
  });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await loaders.receiptStore.save(receipt);
  await loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  const button = nodes(renders.at(-1)).find(
    node => node.tagName === 'BUTTON' && copy(node).includes('Ruaj në inbox privat')
  );
  assert.ok(button);
  button.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, [receipt]);
  assert.match(copy(nodes(renders.at(-1))[0]), /Receipt-i u ruajt në inbox-in privat/);
});

test('hides private-inbox save when the browser does not support directory access', async () => {
  globalThis.localStorage = makeStorage();
  const renders = [];
  const loaders = createReviewRouteLoaders({
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: { packet } }) },
    directoryWriter: { supported: false, async save() {} },
    isCurrent: token => token === 1,
    render: content => renders.push(content),
    navigate() {},
  });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await loaders.receiptStore.save(receipt);
  await loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  assert.equal(copy(nodes(renders.at(-1))[0]).includes('Ruaj në inbox privat'), false);
});

test('renders a private-inbox write failure as an alert', async () => {
  globalThis.localStorage = makeStorage();
  const renders = [];
  const loaders = createReviewRouteLoaders({
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: { packet } }) },
    directoryWriter: {
      supported: true,
      async save() {
        return { ok: false, code: 'write_failed', message: 'Ruajtja dështoi.' };
      },
    },
    isCurrent: token => token === 1,
    render: content => renders.push(content),
    navigate() {},
  });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await loaders.receiptStore.save(receipt);
  await loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  const button = nodes(renders.at(-1)).find(
    node => node.tagName === 'BUTTON' && copy(node).includes('Ruaj në inbox privat')
  );
  button.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  const alert = nodes(renders.at(-1)).find(node => node.attributes.role === 'alert');
  assert.ok(alert);
  assert.match(copy(alert), /Ruajtja dështoi/);
});

test('ignores a second private-inbox click while the first save is pending', async () => {
  globalThis.localStorage = makeStorage();
  const renders = [];
  let saves = 0;
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const loaders = createReviewRouteLoaders({
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: { packet } }) },
    directoryWriter: {
      supported: true,
      async save() {
        saves += 1;
        await pending;
        return { ok: true, code: 'saved', message: 'U ruajt.' };
      },
    },
    isCurrent: token => token === 1,
    render: content => renders.push(content),
    navigate() {},
  });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  await loaders.receiptStore.save(receipt);
  await loaders.receipt({ name: 'receipt', receiptId: receipt.receiptId }, 1);
  const button = nodes(renders.at(-1)).find(
    node => node.tagName === 'BUTTON' && copy(node).includes('Ruaj në inbox privat')
  );
  button.listeners.click();
  button.listeners.click();
  assert.equal(saves, 1);
  release();
  await new Promise(resolve => setImmediate(resolve));
});
