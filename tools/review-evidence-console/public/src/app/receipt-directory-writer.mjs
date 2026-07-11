import { canonicalStringify } from '../state/canonical-json.mjs';

const RECEIPT_ID = /^rec_[a-f0-9]{24}$/;
const PICKER_OPTIONS = Object.freeze({
  id: 'interdomestik-reviewer-receipts',
  mode: 'readwrite',
});

const failure = (code, message) => ({ ok: false, code, message });

export function createReceiptDirectoryWriter({
  pickDirectory = globalThis.showDirectoryPicker?.bind(globalThis),
} = {}) {
  const supported = typeof pickDirectory === 'function';
  let directory;
  let directoryPromise;

  async function requestDirectory() {
    if (typeof pickDirectory !== 'function') {
      return failure(
        'unsupported',
        'Ky browser nuk e mbështet inbox-in privat. Përdor Eksporto JSON.'
      );
    }
    if (!directoryPromise) directory = undefined;
    directoryPromise ??= (async () => {
      try {
        directory = await pickDirectory(PICKER_OPTIONS);
        return { ok: true, value: directory };
      } catch (error) {
        const cancelled = error?.name === 'AbortError';
        return failure(
          cancelled ? 'cancelled' : 'permission_failed',
          cancelled
            ? 'Zgjedhja e inbox-it privat u anulua. Receipt-i nuk u ruajt.'
            : 'Inbox-i privat nuk mund të hapej. Përdor Eksporto JSON.'
        );
      } finally {
        directoryPromise = undefined;
      }
    })();
    return directoryPromise;
  }

  function selectDirectory() {
    return directory ? Promise.resolve({ ok: true, value: directory }) : requestDirectory();
  }

  async function save(receipt) {
    if (typeof receipt?.receiptId !== 'string' || !RECEIPT_ID.test(receipt.receiptId)) {
      return failure('invalid_data', 'ID-ja e receipt-it është e pavlefshme.');
    }
    const selected = await selectDirectory();
    if (!selected.ok) return selected;
    let writable;
    try {
      const file = await selected.value.getFileHandle(`${receipt.receiptId}.json`, {
        create: true,
      });
      writable = await file.createWritable();
      await writable.write(canonicalStringify(receipt));
      await writable.close();
      return { ok: true, code: 'saved', message: 'Receipt-i u ruajt në inbox-in privat.' };
    } catch {
      await writable?.abort?.().catch(() => {});
      return failure(
        'write_failed',
        'Receipt-i nuk mund të ruhej në inbox-in privat. Përdor Eksporto JSON.'
      );
    }
  }

  return { requestDirectory, save, supported };
}
