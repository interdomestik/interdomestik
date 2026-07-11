import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createHeader } from '../public/src/components/status.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderInbox } from '../public/src/views/inbox.mjs';
import { copy, fakeDocument, walk } from './fake-dom.mjs';

setDocument(fakeDocument);

const root = new URL('../public/', import.meta.url);

test('declares Albanian document copy and marks the retained product name as English', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /<html lang="sq">/);
  assert.match(html, /<title>Konsola e shqyrtimit dhe evidencës<\/title>/);

  const header = createHeader();
  const product = walk(header).find(node => copy(node).trim() === 'Review & Evidence Console');
  assert.equal(product?.attributes.lang, 'en');
  assert.match(copy(header), /Shqyrtim lokal i evidencës/);
});

test('uses visible Albanian action text as the accessible action name', () => {
  const inbox = renderInbox({
    state: 'populated',
    assignments: [
      {
        id: 'assign_a',
        packetId: 'packet_a',
        status: 'in_progress',
        risk: 'high',
        dueDate: '2026-07-15',
        title: 'Rishikimi i autoritetit — Pjesa A',
        purpose: 'Verifiko kufirin.',
        progress: 'Në progres',
      },
    ],
  });
  const button = walk(inbox).find(node => node.tagName === 'BUTTON');
  assert.equal(button.attributes['aria-label'], copy(button).trim());
  assert.match(copy(inbox), /Importo vërtetimin lokal JSON/);
  assert.match(copy(inbox), /Lexohet në këtë pajisje; nuk ngarkohet kurrë/);
});

test('uses Albanian submission and next-step labels while retaining canonical audit IDs', () => {
  const inbox = renderInbox({
    state: 'populated',
    assignments: [
      {
        id: 'assign_a',
        packetId: 'packet_a',
        submissionStatus: 'submitted',
        receiptId: 'rec_1234567890abcdef12345678',
        packetVersion: '7',
        submittedAt: '2026-07-12T10:30:00.000Z',
        risk: 'high',
        dueDate: '2026-07-15',
        title: 'Pjesa A',
        purpose: 'Verifiko kufirin.',
        progress: 'Dërguar',
      },
    ],
  });
  assert.match(copy(inbox), /Dorëzuar.*Versioni i paketës.*Shiko vërtetimin/);
  const audit = walk(inbox).find(node => node.tagName === 'CODE');
  assert.equal(audit?.attributes.lang, 'en');
});
