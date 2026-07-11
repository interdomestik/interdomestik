import { downloadText } from './download-text.mjs';

const MAX_FILE_BYTES = 1_048_576;

export async function readReceiptFile(file) {
  if (!file || typeof file.name !== 'string' || !file.name.toLowerCase().endsWith('.json')) {
    return { ok: false, code: 'file_type', message: 'Zgjidh një skedar me emër që mbaron me .json.' };
  }
  if (!Number.isFinite(file.size) || file.size > MAX_FILE_BYTES) {
    return { ok: false, code: 'file_size', message: 'JSON-i i vërtetimit duhet të jetë deri në 1 MiB.' };
  }
  try {
    return { ok: true, value: await file.text() };
  } catch {
    return { ok: false, code: 'read_failed', message: 'Skedari i vërtetimit nuk mund të lexohej.' };
  }
}

async function copyText(text, clipboard) {
  try {
    await clipboard.writeText(text);
    return { ok: true, value: undefined, message: 'JSON-i i vërtetimit u kopjua.' };
  } catch {
    return { ok: false, code: 'copy_failed', message: 'JSON-i i vërtetimit nuk mund të kopjohej.' };
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
      message: 'Shkarkimi u bllokua. Përdor JSON-in rezervë vetëm për lexim.',
      text: result.value,
      copy: () => copyText(result.value, options.clipboard ?? navigator.clipboard),
    };
  }
}
