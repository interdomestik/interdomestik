import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizePacket } from '../public/src/models/normalize-fixture.mjs';
import { partA } from './validation-fixtures.mjs';

const baseDescriptor = partA.items[0].requiredResponses[0];

const descriptor = overrides => ({ ...baseDescriptor, ...overrides });

function packetWith(requiredResponses) {
  const id = 'M03A-DESCRIPTOR-TEST';
  return {
    ...partA,
    itemIds: [id],
    items: [{ ...partA.items[0], id, requiredResponses }],
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
