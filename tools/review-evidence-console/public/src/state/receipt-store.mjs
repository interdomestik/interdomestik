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
      return failure('invalid_data', 'Receipt contains non-canonical JSON values.');
    }
    try {
      return await verifyReceipt(receipt);
    } catch {
      return failure('unavailable', 'Receipt verification is unavailable.');
    }
  }

  function read(receiptId) {
    try {
      const text = storage.getItem(keyFor(receiptId));
      if (text === null) return failure('not_found', 'Receipt was not found.');
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch {
        return failure('invalid_data', 'Stored receipt is not valid JSON.');
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
          return failure('hash_mismatch', 'Stored receipt has changed.');
        }
        try {
          if (canonicalStringify(stored) !== canonicalStringify(receipt)) {
            return failure('hash_mismatch', 'Receipt ID already has different content.');
          }
        } catch {
          return failure('invalid_data', 'Stored receipt contains non-canonical JSON values.');
        }
        return { ok: true, value: stored };
      }
      storage.setItem(key, JSON.stringify(receipt));
      return { ok: true, value: receipt };
    } catch (error) {
      return storageFailure(error);
    }
  }

  return {
    save,
    load: verified,
    async list(packetId) {
      try {
        const receipts = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key?.startsWith(PREFIX)) continue;
          const result = await verified(key.slice(PREFIX.length));
          if (!result.ok) return result;
          if (result.value.packetId === packetId) receipts.push(result.value);
        }
        receipts.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
        return { ok: true, value: receipts };
      } catch (error) {
        return storageFailure(error);
      }
    },
    async export(receiptId) {
      const result = await verified(receiptId);
      return result.ok ? { ok: true, value: JSON.stringify(result.value) } : result;
    },
    async import(jsonText, metadata) {
      if (typeof jsonText !== 'string') return failure('invalid_data', 'Import JSON text only.');
      let receipt;
      try {
        receipt = JSON.parse(jsonText);
      } catch {
        return failure('invalid_data', 'Receipt import is not valid JSON.');
      }
      const validation = validateReceipt(receipt, schemaVersion);
      if (!validation.ok) return validation;
      if (!matchesMetadata(receipt, metadata)) {
        return failure('invalid_data', 'Receipt metadata does not match this assignment.');
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
