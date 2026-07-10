import { downloadText } from './download-text.mjs';

const MAX_FILE_BYTES = 1_048_576;

export async function readReceiptFile(file) {
  if (!file || typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.json')) {
    return { ok: false, code: 'file_type', message: 'Choose a file whose name ends in .json.' };
  }
  if (!Number.isFinite(file.size) || file.size > MAX_FILE_BYTES) {
    return { ok: false, code: 'file_size', message: 'Receipt JSON must be 1 MiB or smaller.' };
  }
  try {
    return { ok: true, value: await file.text() };
  } catch {
    return { ok: false, code: 'read_failed', message: 'Receipt file could not be read.' };
  }
}

async function copyText(text, clipboard) {
  try {
    await clipboard.writeText(text);
    return { ok: true, value: undefined, message: 'Receipt JSON copied.' };
  } catch {
    return { ok: false, code: 'copy_failed', message: 'Receipt JSON could not be copied.' };
  }
}

export async function exportReceipt(receiptId, store, options = {}) {
  const result = await store.export(receiptId);
  if (!result.ok) return result;
  const download = options.download ?? ((text, name) => downloadText(text, name));
  try {
    if (download(result.value, `${receiptId}.json`) === false) throw new Error('download');
    return { ok: true, value: undefined };
  } catch {
    return {
      ok: false,
      code: 'download_failed',
      message: 'Download was blocked. Use the read-only JSON fallback.',
      text: result.value,
      copy: () => copyText(result.value, options.clipboard ?? navigator.clipboard),
    };
  }
}
