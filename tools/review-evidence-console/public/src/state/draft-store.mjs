import { failure, isIsoDate, isRecord, storageFailure } from './storage-results.mjs';

const SEGMENT = /^[a-zA-Z0-9._-]+$/;
const PREFIX = 'review-console:v1:draft:';
const requiredStrings = [
  'assignmentId',
  'packetId',
  'reviewerFixtureId',
  'packetVersion',
  'activeItem',
  'editorId',
];

function parseKey(key) {
  if (typeof key !== 'string' || !key.startsWith(PREFIX)) return null;
  const segments = key.slice(PREFIX.length).split(':');
  if (segments.length !== 3 || segments.some(value => !SEGMENT.test(value))) return null;
  return { assignmentId: segments[0], reviewerFixtureId: segments[1], packetVersion: segments[2] };
}

function validateDraft(key, draft, schemaVersion) {
  const identity = parseKey(key);
  if (!identity || !isRecord(draft) || draft.schemaVersion !== schemaVersion) return false;
  if (requiredStrings.some(field => typeof draft[field] !== 'string' || !draft[field]))
    return false;
  if (!isRecord(draft.itemDecisions) || !isIsoDate(draft.updatedAt)) return false;
  return Object.entries(identity).every(([field, value]) => draft[field] === value);
}

export function composeDraftKey(parts) {
  const values = [parts?.assignmentId, parts?.reviewerFixtureId, parts?.packetVersion];
  if (values.some(value => typeof value !== 'string' || !SEGMENT.test(value))) {
    throw new TypeError('Draft key segments must be repo-safe identifiers.');
  }
  return `${PREFIX}${values.join(':')}`;
}

export function createDraftStore({ storage = globalThis.localStorage, schemaVersion }) {
  return {
    load(key) {
      try {
        const text = storage.getItem(key);
        if (text === null) return failure('not_found', 'Draft was not found.');
        let value;
        try {
          value = JSON.parse(text);
        } catch {
          return failure('invalid_data', 'Stored draft is not valid JSON.');
        }
        if (value?.schemaVersion !== schemaVersion) {
          return failure('schema_mismatch', 'Stored draft uses an incompatible schema.');
        }
        if (!validateDraft(key, value, schemaVersion)) {
          return failure('invalid_data', 'Stored draft is incomplete or inconsistent.');
        }
        return { ok: true, value };
      } catch (error) {
        return storageFailure(error);
      }
    },
    save(key, draft, expectedUpdatedAt) {
      if (!validateDraft(key, draft, schemaVersion)) {
        return failure('invalid_data', 'Draft is incomplete or inconsistent.');
      }
      try {
        const currentText = storage.getItem(key);
        if (currentText !== null) {
          let current;
          try {
            current = JSON.parse(currentText);
          } catch {
            return failure('conflict', 'Stored draft changed in another tab.');
          }
          if (current.updatedAt !== expectedUpdatedAt) {
            return failure('conflict', 'Stored draft changed in another tab.');
          }
        }
        storage.setItem(key, JSON.stringify(draft));
        return { ok: true, value: draft };
      } catch (error) {
        return storageFailure(error);
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
        return { ok: true, value: undefined };
      } catch (error) {
        return storageFailure(error);
      }
    },
    exportRecovery(key) {
      try {
        const value = storage.getItem(key);
        return value === null ? failure('not_found', 'Draft was not found.') : { ok: true, value };
      } catch (error) {
        return storageFailure(error);
      }
    },
  };
}
