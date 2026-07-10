import { composeDraftKey, createDraftStore } from '../state/draft-store.mjs';
import { createReviewSession } from '../state/review-session.mjs';
import { createAutosaveController } from './autosave-controller.mjs';

export function createWorkspaceRuntime({
  bundle,
  initialItemId,
  onRender,
  onNavigate,
  onConflict,
}) {
  const key = composeDraftKey({
    assignmentId: bundle.assignment.id,
    reviewerFixtureId: bundle.reviewer.id,
    packetVersion: bundle.packet.version,
  });
  const store = createDraftStore({ schemaVersion: 1 });
  const loaded = store.load(key);
  const draft = loaded.ok ? loaded.value : undefined;
  let safeEvidenceConfirmed = draft?.safeEvidenceConfirmed === true;
  let saveStatus = loaded.ok ? 'Drafti u rikthye' : 'Ruajtja lokale aktive';
  let recovery = loaded.ok || loaded.code === 'not_found' ? null : { code: loaded.code };
  let autosave;
  const session = createReviewSession(bundle, draft, { onChange: state => changed(state) });
  if (initialItemId && initialItemId !== session.getSnapshot().activeItem)
    session.selectItem(initialItemId);

  autosave = createAutosaveController({
    store,
    key,
    editorId: crypto.randomUUID(),
    initialUpdatedAt: draft?.updatedAt,
    onStatus: status => {
      saveStatus = status;
      if (status.startsWith('Conflict')) recovery = { code: 'conflict', ...recoveryActions() };
      render();
      if (status.startsWith('Conflict')) onConflict?.(recovery);
    },
  });

  function changed(state) {
    render();
    autosave?.schedule(draftFrom(state));
  }
  function draftFrom(state) {
    return { ...state, safeEvidenceConfirmed };
  }
  function render() {
    const state = session.getSnapshot();
    onRender({
      bundle,
      state,
      safeEvidenceConfirmed,
      saveStatus,
      recovery: recovery ? { ...recoveryActions(), ...recovery } : null,
      onSelectItem: selectItem,
      onUseGuidance: session.useGuidance,
      onDecision: session.setDecision,
      onField: session.setField,
      onResponse: session.setResponse,
      onSafeEvidence: value => {
        safeEvidenceConfirmed = value === true;
        changed(state);
      },
    });
  }
  function selectItem(itemId) {
    session.selectItem(itemId);
    onNavigate(bundle.assignment.id, itemId);
  }
  function recoveryActions() {
    return {
      reload: () => location.reload(),
      exportLocal: () => store.exportRecovery(key),
      deleteDraft: () => store.remove(key),
    };
  }
  const storageHandler = event => autosave.handleStorage(event);
  addEventListener('storage', storageHandler);
  render();
  return {
    dispose: () => removeEventListener('storage', storageHandler),
    recovery:
      loaded.ok || loaded.code === 'not_found' ? null : { code: loaded.code, ...recoveryActions() },
  };
}
