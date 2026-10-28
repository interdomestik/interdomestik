const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function operationKey(runId, scenario) {
  return (
    'm4-fixture:' +
    JSON.stringify([
      runId,
      scenario.profile,
      scenario.claimId,
      scenario.targetMode,
      scenario.staffId ?? null,
    ])
  );
}
export function retainedOperationId(storage, key, generate) {
  const previous = storage.getItem(key);
  if (previous !== null) {
    if (!UUID.test(previous)) throw Error('Stored operation identity refused');
    return previous;
  }
  const next = generate();
  if (!UUID.test(next)) throw Error('Generated operation identity refused');
  storage.setItem(key, next);
  if (storage.getItem(key) !== next) throw Error('Operation identity storage refused');
  return next;
}
