import assert from 'node:assert/strict';
import test from 'node:test';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { receiptInput, submittedAt } from './state-fixtures.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';

globalThis.document = fakeDocument;
const { renderReceipt } = await import('../public/src/views/receipt.mjs');

const packet = {
  items: [
    {
      id: 'item_a',
      requiredResponses: [
        { key: 'ownerRole', labelSq: 'Roli i pronarit', type: 'text' },
        {
          key: 'medicalBoundary',
          labelSq: 'Kufiri mjekësor',
          type: 'select',
          optionLabelsSq: { excluded: 'Përjashto' },
        },
      ],
    },
  ],
};

test('renders complete read-only receipt metadata, risk, evidence, and disclaimer', async () => {
  const complete = {
    ...receiptInput.decisions.item_a,
    decision: 'change',
    concreteAnswer: 'Approve boundary.',
    reason: 'Evidence matches.',
    evidenceRef: 'docs/review.md#L1',
    verifiedAt: '2026-07-09',
    requestedChange: 'Clarify owner.',
  };
  const receipt = await buildReceipt({
    ...receiptInput,
    decisions: { item_a: complete },
    structuredResponses: {
      item_a: { ...receiptInput.structuredResponses.item_a, medicalBoundary: 'excluded' },
    },
    submittedAt,
  });
  const node = renderReceipt({
    receipt,
    packet,
    importNotice: 'Lexohet në këtë pajisje; nuk ngarkohet kurrë',
  });
  const content = copy(node);
  assert.match(content, /Vetëm shqyrtim lokal; nuk është autoritet ekzekutimi/);
  assert.match(content, /Kërkon ndryshim.*change/s);
  assert.match(content, /E lartë.*high/s);
  assert.match(content, /Përjashto.*excluded/s);
  const auditCodes = walk(node).filter(entry => entry.tagName === 'CODE');
  assert.ok(auditCodes.every(entry => entry.attributes.lang === 'en'));
  for (const value of [
    receipt.receiptId,
    'Versioni 1',
    receipt.reviewerDisplayName,
    receipt.reviewerRole,
    receipt.submittedAt,
    receipt.riskSummary.severity,
    receipt.authorityDisclaimer,
    receipt.packetId,
    receipt.packetVersion,
    complete.concreteAnswer,
    complete.reason,
    complete.evidenceRef,
    complete.verifiedAt,
    complete.requestedChange,
    'ownerRole',
    'Privacy lead',
    'Lexohet në këtë pajisje; nuk ngarkohet kurrë',
  ])
    assert.match(content, new RegExp(value));
  assert.equal(
    walk(node).some(entry => entry.tagName === 'INPUT' && !entry.attributes.readonly),
    false
  );
});

test('renders complete correction lineage metadata', async () => {
  const first = await buildReceipt({ ...receiptInput, submittedAt });
  const correction = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-10T12:00:00.000Z',
    previousReceipt: first,
    correctionItemId: 'item_a',
    correctionReason: 'Clarify boundary.',
    correctionImpact: 'Improves auditability.',
  });
  const content = copy(renderReceipt({ receipt: correction, packet }));
  for (const value of [first.receiptId, 'item_a', 'Clarify boundary.', 'Improves auditability.'])
    assert.match(content, new RegExp(value));
});

test('omits the return action when no navigation handler is supplied', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const node = renderReceipt({ receipt, packet, onSaveDirectory() {} });
  assert.equal(
    walk(node).some(entry => entry.tagName === 'BUTTON' && copy(entry).includes('Kthehu')),
    false
  );
  const liveRegion = walk(node).find(entry => entry.attributes.role === 'status');
  assert.ok(liveRegion);
  assert.equal(copy(liveRegion).trim(), '');
  assert.equal(liveRegion.attributes['aria-live'], 'polite');
  assert.equal(liveRegion.attributes['aria-atomic'], 'true');
});

test('renders a direct private-inbox action and its latest result', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  let saves = 0;
  const node = renderReceipt({
    receipt,
    packet,
    onSaveDirectory: () => {
      saves += 1;
    },
    directoryResult: { ok: true, message: 'Receipt-i u ruajt në inbox-in privat.' },
  });
  const button = walk(node).find(
    entry => entry.tagName === 'BUTTON' && copy(entry).includes('Ruaj në inbox privat')
  );
  assert.ok(button);
  button.listeners.click();
  assert.equal(saves, 1);
  assert.match(copy(node), /Receipt-i u ruajt në inbox-in privat/);
  const children = node.childNodes.filter(Boolean);
  const buttonIndex = children.indexOf(button);
  assert.equal(children[buttonIndex + 1].attributes.role, 'status');
});

test('announces a private-inbox failure as an alert next to its action', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const node = renderReceipt({
    receipt,
    packet,
    onSaveDirectory() {},
    directoryResult: { ok: false, message: 'Ruajtja dështoi.' },
  });
  const children = node.childNodes.filter(Boolean);
  const buttonIndex = children.findIndex(
    entry => entry.tagName === 'BUTTON' && copy(entry).includes('Ruaj në inbox privat')
  );
  assert.equal(children[buttonIndex + 1].attributes.role, 'alert');
  assert.match(copy(children[buttonIndex + 1]), /Ruajtja dështoi/);
});
