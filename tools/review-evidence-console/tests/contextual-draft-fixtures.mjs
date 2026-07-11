import { composeDraftKey } from '../public/src/state/draft-store.mjs';
import { createDraftContextSchema } from '../public/src/state/draft-context-schema.mjs';
import { bundle } from './review-session-fixtures.mjs';

export const contextualDraftSchema = createDraftContextSchema(bundle.packet);

export const contextualDraftKey = composeDraftKey({
  assignmentId: bundle.assignment.id,
  reviewerFixtureId: bundle.reviewer.id,
  packetVersion: bundle.packet.version,
});

export function contextualDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    suggestionVersion: 2,
    assignmentId: bundle.assignment.id,
    packetId: bundle.packet.id,
    reviewerFixtureId: bundle.reviewer.id,
    packetVersion: bundle.packet.version,
    itemDecisions: { item_a: {}, item_b: {} },
    activeItem: 'item_a',
    updatedAt: '2026-07-09T12:00:00.000Z',
    editorId: 'tab_a',
    contextualNoteState: {
      item_a: { requestedChange: { status: 'unseen' } },
      item_b: { requestedChange: { status: 'unseen' } },
    },
    ...overrides,
  };
}

export function draftWithUnknownField() {
  const draft = contextualDraft();
  draft.contextualNoteState.item_a.unknown = { status: 'unseen' };
  return draft;
}

export const contextualFixtures = {
  draft: contextualDraft,
  key: contextualDraftKey,
  schema: contextualDraftSchema,
};
