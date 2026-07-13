import { normalizeItem } from './normalize-review.mjs';

function requiredString(record, key) {
  if (typeof record?.[key] !== 'string' || record[key].trim() === '') {
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

function normalizeLegacySubmission(value) {
  if (value === undefined) return undefined;
  for (const key of ['receiptId', 'submittedAt']) requiredString(value, key);
  return { receiptId: value.receiptId, submittedAt: value.submittedAt };
}

export function normalizeReviewer(reviewer) {
  for (const key of ['id', 'displayName', 'role']) requiredString(reviewer, key);
  if (reviewer.repoSafe !== true) throw new TypeError('repoSafe must be true.');
  const draftScope = reviewer.draftScope ?? `draft_fixture_${reviewer.id}`;
  requiredString({ draftScope }, 'draftScope');
  return { ...reviewer, draftScope };
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
    'titleSq',
    'purposeSq',
  ]) {
    requiredString(assignment, key);
  }
  if (assignment.continuesWithAssignmentId !== undefined) {
    requiredString(assignment, 'continuesWithAssignmentId');
  }
  if (assignment.fixture !== true) throw new TypeError('fixture must be true.');
  const legacySubmission = normalizeLegacySubmission(assignment.legacySubmission);
  return { ...assignment, ...(legacySubmission ? { legacySubmission } : {}) };
}

export function validateAssignmentContinuations(assignments) {
  const byId = new Map(assignments.map(assignment => [assignment.id, assignment]));
  for (const assignment of assignments) {
    const continuationId = assignment.continuesWithAssignmentId;
    if (continuationId === undefined) continue;
    const continuation = byId.get(continuationId);
    if (
      !continuation ||
      continuation === assignment ||
      continuation.reviewerFixtureId !== assignment.reviewerFixtureId
    ) {
      throw new TypeError(
        'continuesWithAssignmentId must name another assignment for this reviewer.'
      );
    }
  }
  return assignments;
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
