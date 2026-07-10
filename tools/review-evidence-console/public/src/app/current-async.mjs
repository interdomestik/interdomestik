export async function awaitCurrent(promise, isCurrent) {
  const value = await promise;
  return isCurrent() ? { ok: true, value } : { ok: false, code: 'stale' };
}

export function takeValue(holder) {
  const value = holder.value;
  holder.value = null;
  return value;
}
