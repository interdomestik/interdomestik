export async function awaitCurrent(promise, isCurrent) {
  const value = await promise;
  return isCurrent() ? { ok: true, value } : { ok: false, code: 'stale' };
}
