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
    onStatus('Duke ruajtur');
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
        result.code === 'conflict'
          ? 'Konflikt — zgjidh ringarkimin ose eksportimin'
          : 'Ruajtja dështoi — provo përsëri'
      );
      return result;
    }
    expectedUpdatedAt = latestDraft.updatedAt;
    onStatus(
      `U ruajt në ${new Date(expectedUpdatedAt).toLocaleTimeString('sq-AL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })}`
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
      onStatus('Konflikt — zgjidh ringarkimin ose eksportimin');
      return true;
    } catch {
      return false;
    }
  }

  function retry() {
    if (!latestDraft || conflicted || disposed) return false;
    clearTimer(timer);
    timer = setTimer(() => !disposed && save(), SAVE_DELAY);
    onStatus('Duke ruajtur');
    return true;
  }

  function flushLatest() {
    if (conflicted || disposed) return { ok: false, code: 'unavailable' };
    if (!latestDraft) {
      return expectedUpdatedAt
        ? { ok: true, code: 'already_saved' }
        : { ok: false, code: 'unavailable' };
    }
    clearTimer(timer);
    return save();
  }

  function dispose() {
    disposed = true;
    clearTimer(timer);
  }

  return {
    schedule,
    retry,
    flushLatest,
    dispose,
    exportLocalText: () => (latestDraft ? JSON.stringify(latestDraft) : null),
    handleStorage,
    isConflicted: () => conflicted,
  };
}
