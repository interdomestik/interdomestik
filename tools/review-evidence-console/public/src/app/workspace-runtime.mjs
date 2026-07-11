import { createReviewSession } from '../state/review-session.mjs';
import { createAutosaveController } from './autosave-controller.mjs';
import { downloadText } from './download-text.mjs';
import { createWorkspaceDraftStore } from './workspace-draft-store.mjs';
export function createWorkspaceRuntime({
  bundle,
  initialItemId,
  onRender,
  onNavigate,
  onConflict,
  onValidate,
  onStatus = () => {},
  getLocalDate,
}) {
  const { key, store } = createWorkspaceDraftStore(bundle);
  const loaded = store.load(key);
  const draft = loaded.ok ? loaded.value : undefined;
  const canInitialize = loaded.ok || loaded.code === 'not_found';
  const needsInitialSave =
    loaded.code === 'not_found' || (loaded.ok && !Object.hasOwn(loaded.value, 'suggestionVersion'));
  let safeEvidenceConfirmed = draft?.safeEvidenceConfirmed === true;
  let saveStatus = loaded.ok ? 'Drafti u rikthye' : 'Ruajtja lokale aktive';
  let recovery = loaded.ok || loaded.code === 'not_found' ? null : { code: loaded.code };
  let autosave,
    initializing = true;
  let routeSelectionPending = false;
  const session = createReviewSession(bundle, draft, {
    applySuggestions: canInitialize,
    getLocalDate,
    onChange: state => changed(state),
  });
  if (initialItemId && initialItemId !== session.getSnapshot().activeItem) {
    session.selectItem(initialItemId);
    routeSelectionPending = canInitialize;
  }
  autosave = createAutosaveController({
    store,
    key,
    editorId: crypto.randomUUID(),
    initialUpdatedAt: draft?.updatedAt,
    onStatus: status => {
      saveStatus = status;
      if (status.startsWith('Konflikt')) recovery = { code: 'conflict', ...recoveryActions() };
      if (status.startsWith('Ruajtja dështoi'))
        recovery = { code: 'save_failed', ...recoveryActions() };
      if (status.startsWith('Konflikt') || status.startsWith('Ruajtja dështoi')) render(false);
      else onStatus(status);
      if (status.startsWith('Konflikt')) onConflict?.(recovery);
    },
  });
  initializing = false;
  if (needsInitialSave) autosave.schedule(draftFrom(session.getSnapshot()));
  function changed(state) {
    if (!canInitialize || initializing) return;
    autosave?.schedule(draftFrom(state));
    routeSelectionPending = false;
  }
  function draftFrom(state) {
    return { ...state, safeEvidenceConfirmed };
  }
  function render(focusHeading = false, focusControlId = null) {
    const state = session.getSnapshot();
    onRender({
      bundle,
      state,
      safeEvidenceConfirmed,
      saveStatus,
      focusHeading,
      focusControlId,
      recovery: recovery ? { ...recoveryActions(), ...recovery } : null,
      onSelectItem: selectItem,
      onUseGuidance: itemId => {
        session.useGuidance(itemId);
        render(false, `guidance-start-${itemId}`);
      },
      onDecision: (itemId, value) => {
        session.setDecision(itemId, value);
        render(false, `decision-${itemId}-${value}`);
      },
      onField: session.setField,
      onResponse: (itemId, key, value, controlId) => {
        session.setResponse(itemId, key, value);
        const item = bundle.packet.items.find(entry => entry.id === itemId);
        if (item.requiredResponses.some(entry => entry.requiredWhen?.key === key))
          render(false, controlId ?? `response-${key}`);
      },
      onSafeEvidence: value => {
        safeEvidenceConfirmed = value === true;
        if (!canInitialize) return;
        autosave.schedule(draftFrom(session.getSnapshot()));
        routeSelectionPending = false;
      },
      onValidate: () => {
        if (!canInitialize) return;
        if (routeSelectionPending) {
          autosave.schedule(draftFrom(session.getSnapshot()));
          routeSelectionPending = false;
        }
        const saved = autosave.flushLatest();
        if (!saved.ok) return;
        onValidate?.(
          session.validate(safeEvidenceConfirmed),
          session.getSnapshot(),
          safeEvidenceConfirmed
        );
      },
    });
  }
  function selectItem(itemId) {
    session.selectItem(itemId);
    render(true);
    if (!canInitialize) return;
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
