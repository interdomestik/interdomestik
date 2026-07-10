import { normalizeItem } from './normalize-review.mjs';

function requiredString(record, key) {
  if (typeof record?.[key] !== 'string' || record[key] === '') {
    throw new TypeError(`${key} must be a non-empty string.`);
  }
  return record[key];
}

function stringList(value, key) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(entry => typeof entry !== 'string')
  ) {
    throw new TypeError(`${key} must be a non-empty string array.`);
  }
  return value;
}

export function normalizeReviewer(reviewer) {
  for (const key of ['id', 'displayName', 'role']) requiredString(reviewer, key);
  if (reviewer.repoSafe !== true) throw new TypeError('repoSafe must be true.');
  return { ...reviewer };
}

export function normalizeAssignment(assignment) {
  for (const key of [
    'id',
    'packetId',
    'reviewerFixtureId',
    'reviewerRole',
    'status',
    'dueDate',
    'risk',
  ]) {
    requiredString(assignment, key);
  }
  if (assignment.fixture !== true) throw new TypeError('fixture must be true.');
  return { ...assignment };
}

export function normalizePacket(packet) {
  for (const key of ['id', 'version', 'reviewerRole', 'title', 'scope'])
    requiredString(packet, key);
  const itemIds = stringList(packet.itemIds, 'itemIds');
  if (!Array.isArray(packet.items) || packet.items.length === 0) {
    throw new TypeError('items must be a non-empty array.');
  }
  const items = packet.items.map(normalizeItem);
  if (new Set(itemIds).size !== itemIds.length) throw new TypeError('itemIds must be distinct.');
  if (items.length !== itemIds.length || items.some((item, index) => item.id !== itemIds[index])) {
    throw new TypeError('itemIds must match ordered item IDs.');
  }
  return {
    ...packet,
    stopConditions: [...stringList(packet.stopConditions, 'stopConditions')],
    itemIds: [...itemIds],
    items,
  };
}
