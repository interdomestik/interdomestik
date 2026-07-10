import { awaitCurrent } from './current-async.mjs';
import { importReceipt } from './import-controller.mjs';

export async function clearReceipt({ id, store, current, navigate, onError }) {
  const completed = await awaitCurrent(Promise.resolve(store.remove(id)), current);
  if (!completed.ok) return completed;
  if (completed.value.ok) navigate({ name: 'inbox' });
  else onError(completed.value);
  return completed.value;
}

export async function importForCurrent(options) {
  const completed = await awaitCurrent(importReceipt(options), options.current);
  if (!completed.ok) return completed;
  const result = completed.value;
  if (result.ok) options.onImported(result.value.receiptId);
  return result;
}

export function createImportHandler({ repository, receiptStore, imported, navigate, isCurrent }) {
  return async (assignmentId, file, token) =>
    importForCurrent({
      assignmentId,
      file,
      repository,
      receiptStore,
      current: () => token === undefined || isCurrent(token),
      onImported: receiptId => {
        imported.add(receiptId);
        navigate({ name: 'receipt', receiptId });
      },
    });
}
