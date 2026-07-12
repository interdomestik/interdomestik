import { composeDraftKey, createDraftStore } from '../public/src/state/draft-store.mjs';
import { completeDecision } from './review-session-fixtures.mjs';
import { makeStorage } from './state-fixtures.mjs';

export function completedValidationDraft() {
  const storage = makeStorage();
  const key = composeDraftKey({
    assignmentId: 'assign_a',
    reviewerFixtureId: 'reviewer_a',
    packetVersion: '1',
  });
  createDraftStore({ storage, schemaVersion: 1 }).save(key, {
    schemaVersion: 1,
    assignmentId: 'assign_a',
    packetId: 'packet_a',
    reviewerFixtureId: 'reviewer_a',
    packetVersion: '1',
    activeItem: 'item_a',
    editorId: 'editor_a',
    updatedAt: '2026-07-10T12:00:00.000Z',
    safeEvidenceConfirmed: true,
    itemDecisions: { item_a: completeDecision, item_b: completeDecision },
  });
  return storage;
}
