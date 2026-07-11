import assert from 'node:assert/strict';
import test from 'node:test';

import { element, replaceChildren, setDocument, text } from '../public/src/components/dom.mjs';
import { loadInboxRows, progressCopy } from '../public/src/views/inbox-data.mjs';
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
  replaceChildren(...nodes) {
    this.childNodes = [...nodes];
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }
}

const fakeDocument = {
  createElement: tag => new FakeNode(tag),
  createTextNode: value => new FakeNode('#text', String(value)),
};

setDocument(fakeDocument);

function flattened(node) {
  return [node.textContent, ...node.childNodes.map(flattened)].join(' ');
}

test('safe DOM helpers use text nodes and reject HTML injection', () => {
  assert.throws(() => element('p', { innerHTML: '<img src=x>' }), /innerHTML/);
  const copy = text('<strong>safe copy</strong>');
  const target = new FakeNode('div');
  replaceChildren(target, [copy]);
  assert.equal(target.childNodes[0].textContent, '<strong>safe copy</strong>');
});

test('safe DOM helpers enforce tag, attribute, URL, and event allowlists', () => {
  assert.throws(() => element('script'), /tag/i);
  assert.throws(() => element('p', { attributes: { style: 'display:none' } }), /attribute/i);
  assert.throws(() => element('a', { attributes: { href: 'javascript:alert(1)' } }), /unsafe URL/i);
  assert.throws(() => element('button', { on: { mouseover() {} } }), /event/i);
  const link = element('a', { attributes: { href: '#/review/safe/item', 'aria-label': 'Open' } });
  assert.equal(link.attributes.href, '#/review/safe/item');
});

test('inbox renders loading, empty, and unavailable states accessibly', () => {
  assert.match(flattened(renderInbox({ state: 'loading' })), /Po ngarkohen detyrat/);
  assert.match(flattened(renderInbox({ state: 'empty' })), /Nuk ka paketa të caktuara/);
  const unavailable = renderInbox({
    state: 'unavailable',
    message: 'Fixture records are invalid.',
  });
  assert.match(flattened(unavailable), /Detyrat nuk mund të hapen/);
  assert.match(flattened(unavailable), /Fixture records are invalid/);
});

test('populated inbox uses reviewer-first cards with one primary action each', () => {
  const opened = [];
  const inbox = renderInbox({
    state: 'populated',
    onOpen: assignment => opened.push(assignment.id),
    assignments: [
      {
        id: 'assign_mob03a_part_a',
        packetId: 'mob-03a-part-a',
        status: 'in_progress',
        risk: 'high',
        dueDate: '2026-07-15',
        title: 'Rishikimi i autoritetit — Pjesa A',
        purpose: 'Verifiko kufijtë e privatësisë dhe rolet e aksesit.',
        progress: 'Në progres — hap paketën për detaje',
      },
    ],
  });
  const copy = flattened(inbox);
  assert.match(copy, /mob-03a-part-a/);
  assert.match(copy, /Rishikimi i autoritetit/);
  assert.match(copy, /Rrezik i lartë/);
  assert.match(copy, /Në progres — hap paketën për detaje/);
  assert.match(copy, /Vazhdo paketën/);
  const button = inbox.childNodes[1].childNodes.find(node => node.tagName === 'BUTTON');
  button.listeners.click();
  assert.deepEqual(opened, ['assign_mob03a_part_a']);
});

test('progress copy never fabricates numeric completion', () => {
  assert.equal(progressCopy('not_started'), 'Nuk ka filluar');
  assert.equal(progressCopy('in_progress'), 'Në progres — hap paketën për detaje');
  assert.equal(progressCopy('ready'), 'Gati për dorëzim');
  assert.equal(progressCopy('submitted'), 'Dërguar');
});

test('inbox rows fail closed when an assignment bundle is inconsistent', async () => {
  const calls = [];
  const repository = {
    listAssignments: async () => ({
      ok: true,
      value: [{ id: 'assign_a', reviewerFixtureId: 'reviewer_a' }],
    }),
    loadAssignmentBundle: async assignmentId => {
      calls.push(assignmentId);
      return { ok: false, code: 'invalid_data', message: 'Roles do not match.' };
    },
  };
  const result = await loadInboxRows(repository, 'reviewer_a');
  assert.deepEqual(calls, ['assign_a']);
  assert.deepEqual(result, {
    ok: false,
    code: 'invalid_data',
    message: 'Roles do not match.',
  });
});

test('inbox rows reject an ok bundle whose cross-record roles disagree', async () => {
  const assignment = {
    id: 'assign_a',
    packetId: 'packet_a',
    reviewerFixtureId: 'reviewer_a',
    reviewerRole: 'privacy',
    status: 'not_started',
  };
  const repository = {
    listAssignments: async () => ({ ok: true, value: [assignment] }),
    loadAssignmentBundle: async () => ({
      ok: true,
      value: {
        assignment,
        reviewer: { id: 'reviewer_a', role: 'privacy' },
        packet: { id: 'packet_a', reviewerRole: 'security', itemIds: ['ITEM-1'] },
      },
    }),
  };
  const result = await loadInboxRows(repository, 'reviewer_a');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'invalid_data');
});
