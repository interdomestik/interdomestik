import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePacket } from '../public/src/models/normalize-fixture.mjs';
import { partA } from './validation-fixtures.mjs';

const baseDescriptor = partA.items[0].requiredResponses[0];

const descriptor = overrides => {
  const value = { ...baseDescriptor, ...overrides };
  if (!Object.hasOwn(overrides, 'optionLabelsSq')) {
    value.optionLabelsSq = Object.fromEntries(value.options.map(option => [option, option]));
  }
  return value;
};

function packetWith(requiredResponses) {
  const id = 'M03A-DESCRIPTOR-TEST';
  return {
    ...partA,
    itemIds: [id],
    items: [
      {
        ...partA.items[0],
        id,
        requiredResponses,
        suggestedReview: { ...partA.items[0].suggestedReview, responses: {} },
      },
    ],
  };
}

test('rejects unsupported descriptor types', () => {
  assert.throws(
    () => normalizePacket(packetWith([descriptor({ type: 'url' })])),
    /type must be supported/
  );
});

test('requires unique nonempty options for option descriptors', () => {
  for (const type of ['select', 'radio', 'multi_select', 'checkbox_group']) {
    assert.throws(
      () => normalizePacket(packetWith([descriptor({ type, options: [] })])),
      /options must be non-empty/
    );
  }
  assert.throws(
    () => normalizePacket(packetWith([descriptor({ type: 'select', options: ['yes', 'yes'] })])),
    /options must be unique/
  );
  assert.throws(
    () => normalizePacket(packetWith([descriptor({ type: 'select', options: [''] })])),
    /options must contain non-empty strings/
  );
});

test('requires optionLabelsSq to match option keys exactly', () => {
  const options = ['allowed', 'excluded'];
  const base = { type: 'select', options };
  assert.throws(
    () => normalizePacket(packetWith([descriptor({ ...base, optionLabelsSq: undefined })])),
    /optionLabelsSq must be an object/
  );
  assert.throws(
    () => normalizePacket(packetWith([descriptor({ ...base, optionLabelsSq: { allowed: 'Lejo' } })])),
    /optionLabelsSq keys must exactly match options/
  );
  assert.throws(
    () =>
      normalizePacket(
        packetWith([
          descriptor({
            ...base,
            optionLabelsSq: { allowed: 'Lejo', excluded: 'Përjashto', extra: 'Tjetër' },
          }),
        ])
      ),
    /optionLabelsSq keys must exactly match options/
  );
  assert.throws(
    () =>
      normalizePacket(
        packetWith([descriptor({ ...base, optionLabelsSq: { allowed: '', excluded: 'Përjashto' } })])
      ),
    /optionLabelsSq must contain non-empty strings/
  );
  const duplicateLabels = normalizePacket(
    packetWith([
      descriptor({ ...base, optionLabelsSq: { allowed: 'Lejo', excluded: 'Lejo' } }),
    ])
  );
  assert.deepEqual(duplicateLabels.items[0].requiredResponses[0].optionLabelsSq, {
    allowed: 'Lejo',
    excluded: 'Lejo',
  });
});

test('keeps text, evidence, and date descriptors option-free', () => {
  for (const type of ['text', 'textarea', 'evidenceRef', 'date']) {
    assert.throws(
      () =>
        normalizePacket(
          packetWith([descriptor({ type, maxLength: type === 'date' ? 10 : 80, options: ['x'] })])
        ),
      /options must be empty/
    );
  }
  assert.throws(
    () => normalizePacket(packetWith([descriptor({ type: 'date', maxLength: 80 })])),
    /date maxLength must be 10/
  );
});

test('requires conditional descriptors to reference an existing descriptor', () => {
  assert.throws(
    () =>
      normalizePacket(
        packetWith([
          descriptor({
            key: 'details',
            requiredWhen: { key: 'missingControl', equals: 'allowed' },
          }),
        ])
      ),
    /requiredWhen key must reference an existing descriptor/
  );
});

test('requires conditional equals to be allowed by its controlling descriptor', () => {
  assert.throws(
    () =>
      normalizePacket(
        packetWith([
          descriptor({
            key: 'boundary',
            type: 'select',
            options: ['allowed', 'excluded'],
          }),
          descriptor({
            key: 'details',
            requiredWhen: { key: 'boundary', equals: 'unknown' },
          }),
        ])
      ),
    /requiredWhen equals must be an allowed controlling option/
  );
});
