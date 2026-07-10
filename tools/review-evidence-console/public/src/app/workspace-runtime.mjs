import { composeDraftKey, createDraftStore } from '../state/draft-store.mjs';
import { createReviewSession } from '../state/review-session.mjs';
import { createAutosaveController } from './autosave-controller.mjs';
import { downloadText } from './download-text.mjs';

export function createWorkspaceRuntime({
  bundle,
  initialItemId,
  onRender,
  onNavigate,
  onConflict,
  onStatus = () => {},
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
      if (status.startsWith('Save failed'))
        recovery = { code: 'save_failed', ...recoveryActions() };
      if (status.startsWith('Conflict') || status.startsWith('Save failed')) render(false);
      else onStatus(status);
      if (status.startsWith('Conflict')) onConflict?.(recovery);
    },
  });

  function changed(state) {
    autosave?.schedule(draftFrom(state));
  }
  function draftFrom(state) {
    return { ...state, safeEvidenceConfirmed };
  }
  function render(focusHeading = false) {
    const state = session.getSnapshot();
    onRender({
      bundle,
      state,
      safeEvidenceConfirmed,
      saveStatus,
      focusHeading,
      recovery: recovery ? { ...recoveryActions(), ...recovery } : null,
      onSelectItem: selectItem,
      onUseGuidance: itemId => {
        session.useGuidance(itemId);
        render(false);
      },
      onDecision: (itemId, value) => {
        session.setDecision(itemId, value);
        render(false);
      },
      onField: session.setField,
      onResponse: session.setResponse,
      onSafeEvidence: value => {
        safeEvidenceConfirmed = value === true;
        autosave.schedule(draftFrom(state));
      },
    });
  }
  function selectItem(itemId) {
    session.selectItem(itemId);
    render(true);
    const saved = autosave.flushLatest();
    if (!saved.ok) {
      recovery = { code: 'save_failed', ...recoveryActions() };
      render(false);
      return;
    }
    onNavigate(bundle.assignment.id, itemId);
  }
  function recoveryActions() {
    const rawRecovery = () => store.exportRecovery(key).value;
    return {
      reload: () => location.reload(),
      retry: () => autosave.retry(),
      exportLocal: () =>
        downloadText(
          ['conflict', 'save_failed'].includes(recovery?.code)
            ? autosave.exportLocalText()
            : rawRecovery(),
          'review-draft-recovery.json'
        ),
      deleteDraft: () => store.remove(key),
    };
  }
  const storageHandler = event => autosave.handleStorage(event);
  addEventListener('storage', storageHandler);
  render(true);
  return {
    dispose: () => {
      autosave.dispose();
      removeEventListener('storage', storageHandler);
    },
    recovery:
      loaded.ok || loaded.code === 'not_found' ? null : { code: loaded.code, ...recoveryActions() },
  };
}
