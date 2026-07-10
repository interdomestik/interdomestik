const SAVE_DELAY = 450;

export function createAutosaveController({
  store,
  key,
  editorId,
  initialUpdatedAt,
  now = () => new Date().toISOString(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onStatus = () => {},
}) {
  let timer;
  let expectedUpdatedAt = initialUpdatedAt;
  let conflicted = false;
  let disposed = false;
  let latestDraft;

  function schedule(source) {
    if (conflicted || disposed) return false;
    clearTimer(timer);
    onStatus('Saving');
    latestDraft = makeDraft(source);
    timer = setTimer(() => !disposed && save(), SAVE_DELAY);
    return true;
  }

  function makeDraft(source) {
    const draft = {
      ...source,
      itemDecisions: source.decisions,
      schemaVersion: 1,
      editorId,
      updatedAt: now(),
    };
    delete draft.decisions;
    return draft;
  }

  function save() {
    const result = store.save(key, latestDraft, expectedUpdatedAt);
    if (!result.ok) {
      if (result.code === 'conflict') conflicted = true;
      onStatus(
        result.code === 'conflict' ? 'Conflict — choose reload or export' : 'Save failed — retry'
      );
      return result;
    }
    expectedUpdatedAt = latestDraft.updatedAt;
    onStatus(
      `Saved at ${new Date(expectedUpdatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    );
    return result;
  }

  function handleStorage(event) {
    if (event.key !== key || !event.newValue) return false;
    try {
      const external = JSON.parse(event.newValue);
      const externalTime = Date.parse(external.updatedAt);
      const localTime = Math.max(
        Date.parse(expectedUpdatedAt ?? '') || 0,
        Date.parse(latestDraft?.updatedAt ?? '') || 0
      );
      if (
        external.editorId === editorId ||
        !Number.isFinite(externalTime) ||
        externalTime <= localTime
      )
        return false;
      conflicted = true;
      clearTimer(timer);
      onStatus('Conflict — choose reload or export');
      return true;
    } catch {
      return false;
    }
  }

  function retry() {
    if (!latestDraft || conflicted || disposed) return false;
    clearTimer(timer);
    timer = setTimer(() => !disposed && save(), SAVE_DELAY);
    onStatus('Saving');
    return true;
  }

  function dispose() {
    disposed = true;
    clearTimer(timer);
  }

  return {
    schedule,
    retry,
    dispose,
    exportLocalText: () => (latestDraft ? JSON.stringify(latestDraft) : null),
    handleStorage,
    isConflicted: () => conflicted,
  };
}
