import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { renderInbox } from '../public/src/views/inbox.mjs';

class FakeNode {
  constructor(tagName = '#text', value = '') {
    this.tagName = tagName.toUpperCase();
    this.textContent = value;
    this.attributes = {};
    this.childNodes = [];
    this.listeners = {};
  }
  append(...nodes) {
    this.childNodes.push(...nodes);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }
}

setDocument({
  createElement: tag => new FakeNode(tag),
  createTextNode: value => new FakeNode('#text', String(value)),
});

const walk = node => [node, ...node.childNodes.flatMap(walk)];
const copy = node =>
  walk(node)
    .map(entry => entry.textContent)
    .join(' ');

function fixtureInbox() {
  return renderInbox({
    state: 'populated',
    assignments: [
      {
        id: 'assign_a',
        packetId: 'packet-a',
        status: 'in_progress',
        risk: 'high',
        dueDate: '2026-07-15',
        title: 'Paketa A',
        purpose: 'Shqyrto evidencën.',
        progress: 'Në progres',
      },
    ],
  });
}

test('inbox exposes a styled Albanian receipt picker instead of native English chrome', () => {
  const nodes = walk(fixtureInbox());
  const picker = nodes.find(node => node.attributes.class === 'receipt-picker');
  const input = nodes.find(node => node.tagName === 'INPUT' && node.attributes.type === 'file');

  assert.ok(picker);
  assert.match(copy(picker), /Zgjidh vërtetimin JSON/);
  assert.equal(input.attributes.class, 'receipt-picker__input');
  assert.equal(input.attributes.accept, 'application/json,.json');
});

test('inbox marks canonical risk values for visually separated audit display', () => {
  const code = walk(fixtureInbox()).find(node => node.tagName === 'CODE');

  assert.equal(code.attributes.class, 'audit-code');
  assert.equal(code.attributes.lang, 'en');
  assert.equal(copy(code).trim(), 'high');
});
