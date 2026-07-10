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

  function schedule(source) {
    if (conflicted) return false;
    clearTimer(timer);
    onStatus('Saving');
    timer = setTimer(() => save(source), SAVE_DELAY);
    return true;
  }

  function save(source) {
    const updatedAt = now();
    const draft = {
      ...source,
      itemDecisions: source.decisions,
      schemaVersion: 1,
      editorId,
      updatedAt,
    };
    delete draft.decisions;
    const result = store.save(key, draft, expectedUpdatedAt);
    if (!result.ok) {
      if (result.code === 'conflict') conflicted = true;
      onStatus(
        result.code === 'conflict' ? 'Conflict — choose reload or export' : 'Save failed — retry'
      );
      return result;
    }
    expectedUpdatedAt = updatedAt;
    onStatus(
      `Saved at ${new Date(updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    );
    return result;
  }

  function handleStorage(event) {
    if (event.key !== key || !event.newValue) return false;
    try {
      const external = JSON.parse(event.newValue);
      if (external.editorId === editorId) return false;
      conflicted = true;
      clearTimer(timer);
      onStatus('Conflict — choose reload or export');
      return true;
    } catch {
      return false;
    }
  }

  return { schedule, handleStorage, isConflicted: () => conflicted };
}
