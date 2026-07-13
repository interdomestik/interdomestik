import assert from 'node:assert/strict';
import test from 'node:test';
import medical from '../server/fixtures/data/items/m03a-medical-boundary.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderDecision } from '../public/src/components/decision.mjs';
import { byId, fakeDocument } from './fake-dom.mjs';

setDocument(fakeDocument);
const base = { decision: null, concreteAnswer: '', reason: '', requestedChange: '', responses: {} };

test('medical conditional fields are mutually applicable and required', () => {
  const excluded = renderDecision({
    item: medical,
    decision: { ...base, responses: { medicalBoundary: 'excluded' } },
  });
  assert.ok(byId(excluded, 'response-disabledScope'));
  assert.equal(byId(excluded, 'response-dpiaRef'), undefined);
  assert.equal(byId(excluded, 'response-disabledScope').attributes.required, 'required');
  const allowed = renderDecision({
    item: medical,
    decision: { ...base, responses: { medicalBoundary: 'allowed' } },
  });
  assert.ok(byId(allowed, 'response-dpiaRef'));
  assert.equal(byId(allowed, 'response-disabledScope'), undefined);
});

test('required option groups expose native and group required semantics', () => {
  const item = {
    ...medical,
    requiredResponses: [
      { key: 'choice', labelSq: 'Zgjedhja', type: 'radio', required: true, options: ['yes', 'no'] },
    ],
  };
  const view = renderDecision({ item, decision: base });
  const input = byId(view, 'response-choice-0');
  assert.equal(input.attributes.required, 'required');
  assert.equal(input.attributes.name, 'response-choice');
});

test('option groups report the exact activated radio and checkbox control IDs', () => {
  const events = [];
  const item = {
    ...medical,
    requiredResponses: [
      { key: 'choice', labelSq: 'Zgjedhja', type: 'radio', required: true, options: ['no', 'yes'] },
      {
        key: 'areas',
        labelSq: 'Zonat',
        type: 'checkbox_group',
        required: true,
        options: ['one', 'two'],
      },
    ],
  };
  const view = renderDecision({ item, decision: base, onResponse: (...args) => events.push(args) });
  byId(view, 'response-choice-1').listeners.change({ target: { checked: true } });
  byId(view, 'response-areas-1').listeners.change({ target: { checked: true } });
  assert.deepEqual(
    events.map(event => event[2]),
    ['response-choice-1', 'response-areas-1']
  );
});

test('checkbox groups retain cumulative values across changes without a rerender', () => {
  const events = [];
  const item = {
    ...medical,
    requiredResponses: [
      {
        key: 'evidence',
        labelSq: 'Dëshmitë',
        type: 'multi_select',
        required: true,
        options: ['consentStatus', 'recordedAt', 'consentVersion'],
      },
    ],
  };
  const view = renderDecision({ item, decision: base, onResponse: (...args) => events.push(args) });
  const consent = byId(view, 'response-evidence-0');
  const recorded = byId(view, 'response-evidence-1');
  const version = byId(view, 'response-evidence-2');

  consent.listeners.change({ target: { checked: true } });
  recorded.listeners.change({ target: { checked: true } });
  version.listeners.change({ target: { checked: true } });
  recorded.listeners.change({ target: { checked: false } });

  assert.deepEqual(
    events.map(event => event[1]),
    [
      ['consentStatus'],
      ['consentStatus', 'recordedAt'],
      ['consentStatus', 'recordedAt', 'consentVersion'],
      ['consentStatus', 'consentVersion'],
    ]
  );
});
