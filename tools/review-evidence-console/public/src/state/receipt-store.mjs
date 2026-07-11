import { canonicalStringify } from './canonical-json.mjs';
import { matchesMetadata, validateReceipt } from './receipt-schema.mjs';
import { failure, storageFailure } from './storage-results.mjs';

const PREFIX = 'review-console:v1:receipt:';
const keyFor = receiptId => `${PREFIX}${receiptId}`;

export function createReceiptStore({
  storage = globalThis.localStorage,
  verifyReceipt,
  schemaVersion,
}) {
  async function verifySafely(receipt) {
    try {
      canonicalStringify(receipt);
    } catch {
      return failure('invalid_data', 'Vërtetimi përmban vlera JSON jokanonike.');
    }
    try {
      const result = await verifyReceipt(receipt);
      return result.ok
        ? result
        : failure(result.code, 'Vërtetimi dështoi verifikimin e integritetit.');
    } catch {
      return failure('unavailable', 'Verifikimi i vërtetimit nuk është i disponueshëm.');
    }
  }

  function read(receiptId) {
    try {
      const text = storage.getItem(keyFor(receiptId));
      if (text === null) return failure('not_found', 'Vërtetimi nuk u gjet.');
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return failure('invalid_data', 'Vërtetimi i ruajtur nuk është JSON i vlefshëm.');
      }
    } catch (error) {
      return storageFailure(error);
    }
  }

  async function verified(receiptId) {
    const result = read(receiptId);
    if (!result.ok) return result;
    const validation = validateReceipt(result.value, schemaVersion);
    return validation.ok ? verifySafely(result.value) : validation;
  }

  async function save(receipt) {
    const validation = validateReceipt(receipt, schemaVersion);
    if (!validation.ok) return validation;
    const verification = await verifySafely(receipt);
    if (!verification.ok) return verification;
    try {
      const key = keyFor(receipt.receiptId);
      const current = storage.getItem(key);
      if (current !== null) {
        let stored;
        try {
          stored = JSON.parse(current);
        } catch {
          return failure('hash_mismatch', 'Vërtetimi i ruajtur ka ndryshuar.');
        }
        try {
          if (canonicalStringify(stored) !== canonicalStringify(receipt)) {
            return failure('hash_mismatch', 'ID-ja e vërtetimit ka tashmë përmbajtje tjetër.');
          }
        } catch {
          return failure('invalid_data', 'Vërtetimi i ruajtur përmban vlera JSON jokanonike.');
        }
        return { ok: true, value: stored };
      }
      storage.setItem(key, JSON.stringify(receipt));
      return { ok: true, value: receipt };
    } catch (error) {
      return storageFailure(error);
    }
  }

  async function listAll() {
    try {
      const receipts = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(PREFIX)) continue;
        const result = await verified(key.slice(PREFIX.length));
        if (!result.ok) return result;
        receipts.push(result.value);
      }
      receipts.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      return { ok: true, value: receipts };
    } catch (error) {
      return storageFailure(error);
    }
  }

  return {
    save,
    load: verified,
    listAll,
    async list(packetId) {
      const result = await listAll();
      return result.ok
        ? { ok: true, value: result.value.filter(receipt => receipt.packetId === packetId) }
        : result;
    },
    async export(receiptId) {
      const result = await verified(receiptId);
      return result.ok ? { ok: true, value: JSON.stringify(result.value) } : result;
    },
    async import(jsonText, metadata) {
      if (typeof jsonText !== 'string') return failure('invalid_data', 'Importo vetëm tekst JSON.');
      let receipt;
      try {
        receipt = JSON.parse(jsonText);
      } catch {
        return failure('invalid_data', 'Importi i vërtetimit nuk është JSON i vlefshëm.');
      }
      const validation = validateReceipt(receipt, schemaVersion);
      if (!validation.ok) return validation;
      if (!matchesMetadata(receipt, metadata)) {
        return failure('invalid_data', 'Metadatat e vërtetimit nuk përputhen me këtë detyrë.');
      }
      const verification = await verifySafely(receipt);
      if (!verification.ok) return verification;
      return save(receipt);
    },
    remove(receiptId) {
      try {
        storage.removeItem(keyFor(receiptId));
        return { ok: true, value: undefined };
      } catch (error) {
        return storageFailure(error);
      }
    },
  };
}
