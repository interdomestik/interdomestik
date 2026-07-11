import { createDraftContextSchema } from '../state/draft-context-schema.mjs';
import { composeDraftKey, createDraftStore } from '../state/draft-store.mjs';

export function createWorkspaceDraftStore(bundle) {
  const key = composeDraftKey({
    assignmentId: bundle.assignment.id,
    reviewerFixtureId: bundle.reviewer.id,
    packetVersion: bundle.packet.version,
  });
  const contextSchema = createDraftContextSchema(bundle.packet);
  return { key, store: createDraftStore({ schemaVersion: 1, contextSchema }) };
}
