import { composeDraftKey, createDraftStore } from '../state/draft-store.mjs';
import { createDraftContextSchema } from '../state/draft-context-schema.mjs';
import { createReviewSession } from '../state/review-session.mjs';

export async function startCorrection({
  bundle,
  receipt,
  metadata,
  storage = globalThis.localStorage,
  getLocalDate,
}) {
  try {
    const session = createReviewSession(bundle, undefined, {
      applySuggestions: false,
      getLocalDate,
    });
    const state = await session.createCorrection(receipt, metadata);
    const key = composeDraftKey({
      assignmentId: receipt.assignmentId,
      reviewerFixtureId: receipt.reviewerFixtureId,
      packetVersion: receipt.packetVersion,
    });
    const store = createDraftStore({
      storage,
      schemaVersion: 1,
      contextSchema: createDraftContextSchema(bundle.packet),
    });
    const current = store.load(key);
    const draft = {
      ...state,
      itemDecisions: state.decisions,
      schemaVersion: 1,
      editorId: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
      safeEvidenceConfirmed: false,
    };
    delete draft.decisions;
    const saved = store.save(key, draft, current.ok ? current.value.updatedAt : undefined);
    return saved.ok ? { ...saved, itemId: metadata.itemId } : saved;
  } catch {
    return {
      ok: false,
      code: 'invalid_data',
      message: 'Zgjidh një artikull dhe shkruaj arsye e ndikim të sigurt për repo.',
    };
  }
}
